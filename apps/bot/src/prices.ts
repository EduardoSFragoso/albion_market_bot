import type { Env, InteractionOption, MessageData, EmbedField, MarketPrice, FlipResult } from './types.ts';
import { COLOR_INFO, MAIN_CITIES, D, iconUrl, entryName, pick, clamp } from './common.ts';
import { siteApi, resolveItem } from './site-api.ts';
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

export async function cmdPreco(env: Env, options: InteractionOption[] | undefined): Promise<MessageData> {
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

  // Vocabulário = ação do usuário. "Comprar agora" é a menor OFERTA (sell_price_min);
  // "Vender agora" é o maior LANCE vivo (buy_price_max) — era isso que os antigos
  // rótulos "Vender por"/"Comprar por" embaralhavam.
  const header = 'Cidade       | Comprar agora | Vender agora';
  const lines = rows.map((r) => {
    const city = r.city.padEnd(14, ' ');
    const buy = r.sellPriceMin > 0 ? D(r.sellPriceMin).padStart(10, ' ') : '        —  ';
    const sell = r.buyPriceMax > 0 ? D(r.buyPriceMax).padStart(10, ' ') : '        —  ';
    let marker = '';
    if (cheapest && r.city === cheapest.city) marker = ' 🛒';
    else if (bestSell && r.city === bestSell.city) marker = ' 💰';
    return `${city}|${buy}|${sell}${marker}`;
  });

  const fields: EmbedField[] = [];
  if (cheapest || bestSell) {
    fields.push({
      name: '⚡ Resumo',
      value: [
        cheapest ? `🛒 Comprar agora: **${cheapest.city}** (${D(cheapest.sellPriceMin)})` : null,
        bestSell ? `💰 Vender agora: **${bestSell.city}** (${D(bestSell.buyPriceMax)})` : null,
      ].filter(Boolean).join('\n'),
    });
  }
  fields.push({
    name: 'Preços por cidade',
    value: `\`\`\`\n${header}\n${'─'.repeat(header.length)}\n${lines.join('\n')}\n\`\`\``,
  });

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
          `Compre em **${best.buyCity}** (instantâneo), venda em **${best.sellCity}** (por ordem) ` +
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
        thumbnail: { url: iconUrl(id, 64) },
        fields,
        footer: { text: `Comprar agora = menor oferta (instantâneo) · Vender agora = maior lance (instantâneo) · Rota: compra instantânea → venda em ordem · Qualidade ${quality}` },
      },
    ],
  };
}
