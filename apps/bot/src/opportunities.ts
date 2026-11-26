import type { Env, InteractionOption, MessageData, RankResponse } from './types.ts';
import { COLOR_OK, COLOR_BAD, SALES_TAX_PCT, SETUP_FEE_PCT, D, iconUrl, numOpt, clampInt } from './common.ts';
import { siteApi } from './site-api.ts';
export async function cmdOportunidades(env: Env, options: InteractionOption[] | undefined): Promise<MessageData> {
  const tierMin = clampInt(numOpt(options, 'tier_min'), 1, 8, 4);
  const tierMax = clampInt(numOpt(options, 'tier_max'), tierMin, 8, 6);
  const ench = numOpt(options, 'encantamento');

  const params: Record<string, string> = {
    tierMin: String(tierMin),
    tierMax: String(tierMax),
    sellCity: 'Black Market',
    buyMode: 'instant',
    rrr: '0.152',
    salesTax: String(SALES_TAX_PCT),
    setupFee: String(SETUP_FEE_PCT),
    topN: '5',
  };
  if (ench !== undefined) params.enchants = String(clampInt(ench, 0, 3, 0));

  const data = await siteApi<RankResponse>(env, 'rank', params);
  if (data.error) return { content: `⚠️ ${data.error}` };
  const entries = data.entries ?? [];
  if (!entries.length) {
    return {
      content: `⚠️ Nenhuma oportunidade encontrada para T${tierMin}–T${tierMax} agora.` +
        `\n💡 Dados dependem de scans da comunidade — tente outra faixa de tier.`,
    };
  }

  // Compacto: top 5, uma linha por item (só nome + lucro) — o detalhado
  // está no site; aqui o usuário quer o resumo seco.
  const description = entries
    .map((e, i) => {
      const sinal = e.profit >= 0 ? '+' : '';
      return `**${i + 1}.** ${(e.pt || e.en).slice(0, 40)}${e.ench ? ` .${e.ench}` : ''} (T${e.tier}) — ${e.profit >= 0 ? '✅' : '❌'} ${sinal}${D(e.profit)} (${D(e.profitPct * 100, 0)}%)`;
    })
    .join('\n');

  return {
    embeds: [
      {
        title: '🔎 Oportunidades de craft (Black Market)',
        description,
        color: entries[0].profit > 0 ? COLOR_OK : COLOR_BAD,
        thumbnail: { url: iconUrl(entries[0].itemId, 64) },
        footer: {
          text: `Compra: cidade mais barata · Venda: Black Market · T${tierMin}–T${tierMax}${ench !== undefined ? ` · encantamento .${ench}` : ''} · detalhe completo no site`,
        },
      },
    ],
  };
}
