import type { Env, InteractionOption, MessageData, FlipResult, MarketPrice } from './types.ts';
import { COLOR_OK, COLOR_BAD, SALES_TAX_PCT, SETUP_FEE_PCT, D, iconUrl, entryName, pick } from './common.ts';
import { siteApi, resolveItem } from './site-api.ts';
export async function cmdLucro(env: Env, options: InteractionOption[] | undefined): Promise<MessageData> {
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

  const { prices } = await siteApi<{ prices: MarketPrice[]; best: FlipResult | null }>(
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
        thumbnail: { url: iconUrl(id, 64) },
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

// ---------- /oportunidades (deferred: o scan em massa pode passar de 3s) ----------
