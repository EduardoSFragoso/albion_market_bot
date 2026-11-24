// Bot Discord do Albion Market Tools — Cloudflare Worker puro (sem SDK do Discord).
// Verifica a assinatura Ed25519 do Discord e responde aos slash commands
// /preco, /craft e /lucro consultando a API interna do site (Pages Functions).
//
// OBS: NÃO importamos @albion/core aqui — o bundle do worker ficaria gigante
// (o índice de itens carrega JSONs de dados). O bot consome apenas os tipos,
// recriados localmente, e busca nomes/preços via SITE_URL.

// ---------- Tipos locais (espelhos de @albion/core/types) ----------

interface ItemIndexEntry {
  id: string;
  en: string;
  pt: string;
  tier: number;
  ench: number;
  cat: string;
  craftable: 0 | 1;
}

interface MarketPrice {
  item_id: string;
  city: string;
  quality: number;
  sell_price_min: number;
  sell_price_min_date: string;
  sell_price_max: number;
  buy_price_min: number;
  buy_price_min_date: string;
  buy_price_max: number;
  buy_price_max_date: string;
}

interface FlipResult {
  buyCity: string;
  sellCity: string;
  buyMode: 'instant' | 'order';
  sellMode: 'instant' | 'order';
  buyPrice: number;
  sellPrice: number;
  netPrice: number;
  profitPerUnit: number;
  profitPct: number;
  stale: boolean;
}

interface CraftResult {
  ok: boolean;
  reason?: string;
  outputId: string;
  amountPerCraft: number;
  materials: Array<{
    id: string;
    countPerCraft: number;
    effectiveCount: number;
    unitPrice: number;
    cost: number;
    missingPrice: boolean;
  }>;
  materialCost: number;
  totalCost: number;
  salePrice: number;
  revenue: number;
  profit: number;
  profitPctOfCost: number;
  missingCities: string[];
}

const MAIN_CITIES = [
  'Thetford',
  'Fort Sterling',
  'Lymhurst',
  'Bridgewatch',
  'Martlock',
  'Caerleon',
  'Brecilien',
  'Black Market',
] as const;

const SALES_TAX_PCT = 8; // base (não premium)
const SETUP_FEE_PCT = 2.5; // base (não premium)

// ---------- Interações do Discord (tipos mínimos locais) ----------

interface InteractionOption {
  name: string;
  value: string | number | boolean;
  type: number;
}

interface Interaction {
  type: number; // 1 = PING
  data?: {
    id: string;
    name: string;
    options?: InteractionOption[];
  };
}

// InteractionResponseType não existe como tipo global: números puros.
const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
} as const;

const COLOR_OK = 0x22c55e;
const COLOR_BAD = 0xef4444;
const COLOR_INFO = 0x5865f2;

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface Embed {
  title?: string;
  description?: string;
  color?: number;
  fields?: EmbedField[];
  thumbnail?: { url: string };
  footer?: { text: string };
}

interface MessageData {
  content?: string;
  embeds?: Embed[];
  flags?: number;
}

// ---------- Utilidades ----------

const D = (n: number, max = 0) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: max }).format(n);

const iconUrl = (id: string, size: 1 | 3 | 8 = 3): string =>
  `https://render.albiononline.com/v1/item/${encodeURIComponent(id)}.png?size=${size}&quality=1`;

/** Enchant como sufixo ".n": T5_BAG@3 (ou nome com ench=3) → "… .3". */
function withEnchSuffix(text: string, id: string): string {
  const m = /@(\d+)$/.exec(id);
  if (m) return `${text} .${m[1]}`;
  return text;
}

function entryName(entry: ItemIndexEntry | undefined, id: string): string {
  if (!entry) return withEnchSuffix(id, id);
  const base = entry.pt || entry.en || entry.id;
  const ench = entry.ench > 0 ? ` .${entry.ench}` : '';
  return base + ench;
}

function pick(opt: InteractionOption[] | undefined, name: string): string | undefined {
  const v = opt?.find((o) => o.name === name)?.value;
  return v == null ? undefined : String(v);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function errorEmbed(title: string, detail: string): Embed {
  return {
    title,
    description: detail,
    color: COLOR_BAD,
  };
}

function reply(data: MessageData): Response {
  return new Response(
    JSON.stringify({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data }),
    { headers: { 'content-type': 'application/json' } },
  );
}

// ---------- API do site ----------

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function siteApi<T>(env: Env, path: string, params: Record<string, string>): Promise<T> {
  const url = `${env.SITE_URL.replace(/\/$/, '')}/api/${path}?${new URLSearchParams(params)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } });
  } catch (err) {
    throw new ApiError('Serviço do site indisponível — tente novamente em instantes.', 503);
  }
  if (res.status !== 200) {
    if (res.status === 404) throw new ApiError('Item não encontrado no serviço do site.', 404);
    throw new ApiError('Serviço do site respondeu com erro — tente novamente em instantes.', res.status);
  }
  return (await res.json()) as T;
}

/** Busca um item: id "T4_BAG" direto; qualquer outra coisa via /api/search (locale pt). */
async function resolveItem(
  env: Env,
  text: string,
): Promise<{ id: string; entry?: ItemIndexEntry } | null> {
  const t = text.trim();
  if (!t) return null;
  // id "exato" no estilo Albion: T4_BAG, T6_BAG@2, @ITEMTYPE etc.
  if (/^[A-Za-z0-9_]+(@\d+)?$/.test(t) && t.includes('_')) {
    return { id: t.toUpperCase() };
  }
  const data = await siteApi<{ results: ItemIndexEntry[] }>(env, 'search', {
    q: t,
    locale: 'pt',
    limit: '12',
  });
  return data.results[0] ?? null;
}

/** Nome em PT-BR de qualquer id (inclusive materiais): busca por id na API do site. */
function nameResolver(env: Env, locale: 'pt' | 'en') {
  const cache = new Map<string, string>();
  return async (id: string): Promise<string> => {
    const hit = cache.get(id);
    if (hit !== undefined) return hit;
    let name: string;
    try {
      const data = await siteApi<{ results: ItemIndexEntry[] }>(env, 'search', {
        q: id,
        locale,
        limit: '5',
      });
      const entry = data.results.find((r) => r.id === id) ?? data.results[0];
      name = entryName(entry, id);
    } catch {
      name = withEnchSuffix(id, id);
    }
    cache.set(id, name);
    return name;
  };
}

// ---------- Verificação de assinatura Ed25519 ----------

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verifyDiscordSignature(
  env: Env,
  request: Request,
  rawBody: string,
): Promise<boolean> {
  const sigHex = request.headers.get('x-signature-ed25519') ?? '';
  const timestamp = request.headers.get('x-signature-timestamp') ?? '';
  if (!env.DISCORD_PUBLIC_KEY || !/^[0-9a-fA-F]{128}$/.test(sigHex) || !/^\d+$/.test(timestamp)) {
    return false;
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(env.DISCORD_PUBLIC_KEY),
    { name: 'Ed25519' },
    false,
    ['verify'],
  );
  const message = enc.encode(`${timestamp}${rawBody}`);
  return crypto.subtle.verify('Ed25519', key, hexToBytes(sigHex), message);
}

// ---------- Handlers dos comandos ----------

interface PriceRow {
  city: string;
  sellPriceMin: number;
  buyPriceMax: number;
}

function toRows(prices: MarketPrice[], itemId: string, quality: number): PriceRow[] {
  const rows = new Map<string, PriceRow>();
  for (const p of prices) {
    if (p.item_id !== itemId) continue;
    if (p.quality !== quality) continue;
    const row = rows.get(p.city) ?? { city: p.city, sellPriceMin: 0, buyPriceMax: 0 };
    row.sellPriceMin = Math.max(row.sellPriceMin, p.sell_price_min);
    row.buyPriceMax = Math.max(row.buyPriceMax, p.buy_price_max);
    rows.set(p.city, row);
  }
  return [...rows.values()].sort(
    (a, b) => MAIN_CITIES.indexOf(a.city as never) - MAIN_CITIES.indexOf(b.city as never),
  );
}

async function cmdPreco(env: Env, options: InteractionOption[] | undefined): Promise<MessageData> {
  const text = pick(options, 'item');
  if (!text) return { content: '❌ Informe o item (ex.: `Fonte da Cidade` ou `T4_BAG`).' };

  const quality = clamp(Number(pick(options, 'qualidade') ?? 1) || 1, 1, 5);
  const found = await resolveItem(env, text);
  if (!found) {
    return {
      content: `❌ Nenhum item encontrado para **${text}**.\n💡 Tente outro termo (PT ou EN) ou o id exato, como \`T4_BAG\`.`,
    };
  }
  const id = found.id;
  const name = entryName(found.entry, id);

  const { prices } = await siteApi<{ prices: MarketPrice[] }>(env, 'prices', {
    items: id,
    qualities: String(quality),
  });
  const rows = toRows(prices, id, quality).filter(
    (r) => r.sellPriceMin > 0 || r.buyPriceMax > 0,
  );
  if (!rows.length) {
    return {
      content: `⚠️ Sem dados de mercado para **${name}** (qualidade ${quality}) no momento.`,
    };
  }

  const cheapest = rows.filter((r) => r.sellPriceMin > 0).sort((a, b) => a.sellPriceMin - b.sellPriceMin)[0];
  const bestSell = rows.filter((r) => r.buyPriceMax > 0).sort((a, b) => b.buyPriceMax - a.buyPriceMax)[0];

  const header = 'Cidade         │ Vender por │ Comprar por';
  const lines = rows.map((r) => {
    const city = r.city.padEnd(14, ' ');
    const sell = r.sellPriceMin > 0 ? D(r.sellPriceMin).padStart(9, ' ') : '     —   ';
    const buy = r.buyPriceMax > 0 ? D(r.buyPriceMax).padStart(9, ' ') : '     —   ';
    let marker = '';
    if (cheapest && r.city === cheapest.city) marker = ' ◀ comprar';
    else if (bestSell && r.city === bestSell.city) marker = ' ◀ vender';
    return `${city}│ ${sell} │ ${buy}${marker}`;
  });

  const fields: EmbedField[] = [
    {
      name: 'Preços por cidade',
      value: `\`\`\`\n${header}\n${'─'.repeat(header.length)}\n${lines.join('\n')}\n\`\`\``,
    },
  ];

  // Melhor rota (flip): compra instantânea → venda em ordem, com impostos.
  try {
    const { best } = await siteApi<{ prices: MarketPrice[]; best: FlipResult | null }>(
      env,
      'flip',
      { item: id },
    );
    if (best) {
      const sinal = best.profitPerUnit > 0 ? '+' : '';
      fields.push({
        name: '🚚 Melhor rota',
        value:
          `Compre em **${best.buyCity}**, venda em **${best.sellCity}** ` +
          `(${sinal}${D(best.profitPerUnit)} lucro/unid., ${D(best.profitPct * 100, 1)}%)`,
      });
    } else {
      fields.push({ name: '🚚 Melhor rota', value: 'Sem rota lucrativa detectada.' });
    }
  } catch (err) {
    // rota é bônus: se falhar, não derruba o comando inteiro
    fields.push({ name: '🚚 Melhor rota', value: '⚠️ Não foi possível calcular a rota agora.' });
  }

  return {
    embeds: [
      {
        title: `${name} — preços`,
        color: COLOR_INFO,
        thumbnail: { url: iconUrl(id, 3) },
        fields,
        footer: { text: `Qualidade ${quality} · Compra instantânea (menor oferta) · Venda por ordem (maior oferta de compra)` },
      },
    ],
  };
}

async function cmdCraft(env: Env, options: InteractionOption[] | undefined): Promise<MessageData> {
  const text = pick(options, 'item');
  if (!text) return { content: '❌ Informe o item (ex.: `Fonte da Cidade` ou `T4_BAG`).' };
  const buyCity = pick(options, 'cidade_compra') ?? 'Caerleon';
  const sellCity = pick(options, 'cidade_venda') ?? 'Black Market';
  const rrrRaw = Number(pick(options, 'rrr'));
  const rrr = Number.isFinite(rrrRaw) ? clamp(rrrRaw, 0, 0.6) : 0.152;

  const found = await resolveItem(env, text);
  if (!found) {
    return {
      content: `❌ Nenhum item encontrado para **${text}**.\n💡 Tente outro termo (PT ou EN) ou o id exato, como \`T4_BAG\`.`,
    };
  }
  const id = found.id;
  const name = entryName(found.entry, id);

  const data = await siteApi<{
    item?: ItemIndexEntry | null;
    recipe?: unknown;
    result?: CraftResult;
    cheapest?: { city: string; unitPrice: number } | null;
    error?: string;
  }>(env, 'craft', {
    item: id,
    buyCity,
    sellCity,
    rrr: String(rrr),
  });

  if (data.error === 'no-recipe' || (!data.result && !data.recipe)) {
    return {
      content: `❌ **${name}** não tem receita de fabricação — posso calcular lucro apenas com /preco ou /lucro.`,
    };
  }
  const result = data.result;
  if (!result) {
    throw new ApiError('Resposta inesperada do serviço do site.', 502);
  }
  if (!result.ok) {
    if (result.reason === 'no-recipe') {
      return {
        content: `❌ **${name}** não tem receita de fabricação — posso calcular lucro apenas com /preco ou /lucro.`,
      };
    }
    return {
      content: `⚠️ Não consegui calcular a fabricação de **${name}**: ${result.reason ?? 'erro desconhecido'}.`,
    };
  }

  const nameFor = nameResolver(env, 'pt');
  const matLines: string[] = [];
  const missing: string[] = [];
  const matPromises = result.materials.map(async (m, i) => {
    const matName = await nameFor(m.id);
    const warn = m.missingPrice ? ' ⚠️ sem preço' : '';
    if (m.missingPrice) missing.push(matName);
    return `${withEnchSuffix(String(i + 1).padStart(2, ' ') + '.', m.id)} ${matName} ×${m.countPerCraft} @ ${D(m.unitPrice)} = ${D(m.cost)}${warn}`;
  });
  for (const line of await Promise.all(matPromises)) matLines.push(line);

  const lucro = result.profit;
  const fields: EmbedField[] = [
    {
      name: '🧱 Materiais',
      value: `\`\`\`\n${matLines.join('\n') || '(sem recursos)'}\n\`\`\``,
    },
    { name: 'Custo dos materiais', value: `💰 ${D(result.materialCost)}`, inline: true },
    { name: `Receita (${sellCity})`, value: `📊 ${D(result.revenue)}`, inline: true },
    {
      name: 'Lucro líquido / craft',
      value: `${lucro >= 0 ? '✅' : '❌'} ${D(lucro)} (${D(result.profitPctOfCost * 100, 1)} do custo)`,
      inline: true,
    },
  ];
  if (missing.length) {
    fields.push({
      name: '⚠️ Atenção',
      value: `Sem preço em **${buyCity}** para: ${missing.join(', ')}.`,
    });
  }
  fields.push({
    name: '🎯 Cidade mais barata p/ comprar materiais',
    value: data.cheapest
      ? `**${data.cheapest.city}** (${D(data.cheapest.unitPrice)} de custo médio — você pediu **${buyCity}**)`
      : `— (você pediu **${buyCity}**)`,
  });

  return {
    embeds: [
      {
        title: `${name} — fabricação`,
        color: lucro >= 0 ? COLOR_OK : COLOR_BAD,
        thumbnail: { url: iconUrl(id, 3) },
        fields,
        footer: {
          text: `Compra em ${buyCity} · Venda em ${sellCity} · RRR ${D(rrr * 100, 1)}% · Impostos base (${SALES_TAX_PCT}% + ${SETUP_FEE_PCT}%)`,
        },
      },
    ],
  };
}

async function cmdLucro(env: Env, options: InteractionOption[] | undefined): Promise<MessageData> {
  const text = pick(options, 'item');
  if (!text) return { content: '❌ Informe o item (ex.: `Fonte da Cidade` ou `T4_BAG`).' };

  const found = await resolveItem(env, text);
  if (!found) {
    return {
      content: `❌ Nenhum item encontrado para **${text}**.\n💡 Tente outro termo (PT ou EN) ou o id exato, como \`T4_BAG\`.`,
    };
  }
  const id = found.id;
  const name = entryName(found.entry, id);

  const { prices, best } = await siteApi<{ prices: MarketPrice[]; best: FlipResult | null }>(
    env,
    'flip',
    { item: id },
  );

  // Top 5 rotas: compra instantânea (menor oferta) → venda em ordem (menor oferta),
  // descontando impostos. Recalculamos a partir dos preços que a API já devolve.
  const byCity = new Map<string, { buy: number; sell: number }>();
  for (const p of prices) {
    if (p.item_id !== id || p.quality !== 1) continue;
    const cur = byCity.get(p.city) ?? { buy: 0, sell: 0 };
    cur.buy = Math.max(cur.buy, p.sell_price_min);
    cur.sell = Math.max(cur.sell, p.sell_price_min);
    byCity.set(p.city, cur);
  }
  const netFactor = (1 - SALES_TAX_PCT / 100) * (1 - SETUP_FEE_PCT / 100);
  const routes: Array<{ buyCity: string; sellCity: string; buy: number; sell: number; profit: number; pct: number }> = [];
  for (const [buyCity, b] of byCity) {
    if (b.buy <= 0) continue;
    for (const [sellCity, s] of byCity) {
      if (sellCity === buyCity || s.sell <= 0) continue;
      const profit = s.sell * netFactor - b.buy;
      routes.push({
        buyCity,
        sellCity,
        buy: b.buy,
        sell: s.sell,
        profit,
        pct: b.buy > 0 ? profit / b.buy : 0,
      });
    }
  }
  routes.sort((a, b) => b.profit - a.profit);
  const top = routes.slice(0, 5);

  if (!top.length) {
    return { content: `⚠️ Sem dados de mercado suficientes para calcular rotas de **${name}**.` };
  }

  const lines = top.map(
    (r, i) =>
      `${String(i + 1).padStart(2, ' ')}. ${r.buyCity.padEnd(14, ' ')} → ${r.sellCity.padEnd(14, ' ')} ` +
      `compra ${D(r.buy)} → venda ${D(r.sell)} | lucro ${r.profit >= 0 ? '+' : ''}${D(r.profit)} (${D(r.pct * 100, 1)}%)`,
  );
  const b = top[0];

  return {
    embeds: [
      {
        title: `${name} — top rotas de lucro`,
        description: 'Compra instantânea → venda em ordem, com impostos já descontados.',
        color: top[0].profit > 0 ? COLOR_OK : COLOR_BAD,
        thumbnail: { url: iconUrl(id, 3) },
        fields: [
          { name: 'Top 5', value: `\`\`\`\n${lines.join('\n')}\n\`\`\`` },
          {
            name: '🚚 Melhor rota',
            value: `Compre em **${b.buyCity}**, venda em **${b.sellCity}** (${b.profit >= 0 ? '+' : ''}${D(b.profit)} lucro/unid., ${D(b.pct * 100, 1)}%)`,
          },
        ],
        footer: { text: 'Impostos base: 8% (venda) + 2.5% (setup) · Preços qualidade 1' },
      },
    ],
  };
}

// ---------- Worker ----------

interface Env {
  SITE_URL: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // healthcheck simples fora do fluxo do Discord
    if (request.method === 'GET') {
      return new Response('albion-market-bot online', { status: 200 });
    }
    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405 });
    }

    const rawBody = await request.text();

    let valid = false;
    try {
      valid = await verifyDiscordSignature(env, request, rawBody);
    } catch {
      valid = false;
    }
    if (!valid) {
      return new Response('invalid signature', { status: 401 });
    }

    let interaction: Interaction;
    try {
      interaction = JSON.parse(rawBody) as Interaction;
    } catch {
      return new Response('invalid JSON', { status: 400 });
    }

    // 1) PING
    if (interaction.type === 1) {
      return new Response(JSON.stringify({ type: InteractionResponseType.PONG }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // 2) Application command
    if (interaction.type === 2 && interaction.data) {
      const options = interaction.data.options;
      try {
        switch (interaction.data.name) {
          case 'preco':
            return reply(await cmdPreco(env, options));
          case 'craft':
            return reply(await cmdCraft(env, options));
          case 'lucro':
            return reply(await cmdLucro(env, options));
          default:
            return reply({ content: `❓ Comando desconhecido: \`/${interaction.data.name}\`.` });
        }
      } catch (err) {
        const detail = err instanceof ApiError ? err.message : 'Erro inesperado — tente novamente.';
        return reply({ content: `⚠️ ${detail}` });
      }
    }

    // Outros tipos (autocomplete etc.): apenas confirma que vimos.
    return new Response(JSON.stringify({ type: InteractionResponseType.PONG }), {
      headers: { 'content-type': 'application/json' },
    });
  },
};
