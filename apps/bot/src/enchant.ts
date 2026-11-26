import type { Env, InteractionOption, MessageData, EmbedField, EnchantResponse } from './types.ts';
import { COLOR_INFO, D, iconUrl, withEnchSuffix, entryName, pick, clamp } from './common.ts';
import { siteApi, resolveItem } from './site-api.ts';
export async function cmdEncantamento(env: Env, options: InteractionOption[] | undefined): Promise<MessageData> {
  const text = pick(options, 'item');
  if (!text) return { content: '❌ Informe o item (ex.: `Bolsa do Adepto` ou `T4_BAG`).' };
  const rrrRaw = Number(pick(options, 'rrr'));
  const rrr = Number.isFinite(rrrRaw) ? clamp(rrrRaw, 0, 0.6) : 0.152;

  const found = await resolveItem(env, text);
  if (!found) {
    return {
      content: `❌ Nenhum item encontrado para **${text}**.\n💡 Tente outro termo (PT ou EN) ou o id exato, como \`T4_BAG\`.`,
    };
  }
  const name = entryName(found.entry, found.id);

  const data = await siteApi<EnchantResponse>(env, 'enchant', {
    item: found.id,
    rrr: String(rrr),
    buyMode: 'instant',
  });
  if (data.error) return { content: `⚠️ ${data.error}` };
  const rows = data.rows ?? [];
  if (!rows.length) return { content: `⚠️ Sem dados de encantamento para **${name}**.` };

  // Um bloco por nível (inline=false, empilhado) — em vez do grid de
  // quadradinhos que ficava difícil de comparar e ler.
  const fields: EmbedField[] = rows.map((r) => {
    const buyLine = r.buyPrice !== null
      ? `🛒 comprar pronto: ${D(r.buyPrice)} (${r.buyCity})`
      : '🛒 comprar pronto: sem oferta';
    const craftLine = !r.hasRecipe
      ? '🔨 craftar: — (sem receita)'
      : r.craftCost !== null ? `🔨 craftar: ${D(r.craftCost)}` : '🔨 craftar: ⚠️ sem preço';
    let verdict: string;
    if (r.cheaper === 'craft') verdict = `→ ✅ **craftar** ${D((r.savingsPct ?? 0) * 100, 1)}% mais barato`;
    else if (r.cheaper === 'buy') verdict = `→ ✅ **comprar pronto** ${D((r.savingsPct ?? 0) * 100, 1)}% mais barato`;
    else if (r.buyPrice !== null && r.craftCost !== null) verdict = '→ ⚖️ empate';
    else verdict = '→ ⚠️ sem dados suficientes';
    return { name: `Nível .${r.ench}`, value: `${buyLine}\n${craftLine}\n${verdict}`, inline: false };
  });

  if (rows.some((r) => r.missing.length > 0 && r.craftCost === null)) {
    fields.push({
      name: '⚠️ Dado faltando',
      value: 'Nível sem veredito = ingrediente sem preço recente no mercado.',
    });
  }
  const priced = rows.filter((r) => r.cheaper !== null);
  if (priced.length) {
    const best = priced.reduce((a, b) => ((b.savingsPct ?? 0) > (a.savingsPct ?? 0) ? b : a));
    const verb = best.cheaper === 'buy' ? 'Comprar pronto' : 'Craftar';
    fields.push({
      name: '🥇 Maior economia',
      value: `**${verb} .${best.ench}** — ${D((best.savingsPct ?? 0) * 100, 1)}% (${D(Math.abs(best.savings ?? 0))} de prata).`,
    });
  }

  return {
    embeds: [
      {
        title: `${withEnchSuffix(name, data.baseId)} — comprar pronto vs. craftar`,
        color: COLOR_INFO,
        thumbnail: { url: iconUrl(data.baseId, 64) },
        fields,
        footer: {
          text: `Comprar = menor oferta viva em qualquer cidade (incl. Black Market) · Craftar = materiais mais baratos, RRR ${D(rrr * 100, 1)}% · sem estágio de retorno`,
        },
      },
    ],
  };
}

/** Edita a resposta diferida via webhook de interação (não precisa do bot token). */
