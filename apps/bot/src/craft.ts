import type { Env, InteractionOption, MessageData, EmbedField, ItemIndexEntry, CraftResult } from './types.ts';
import { COLOR_OK, COLOR_BAD, SALES_TAX_PCT, SETUP_FEE_PCT, D, iconUrl, withEnchSuffix, entryName, pick, clamp } from './common.ts';
import { ApiError, siteApi, resolveItem, nameResolver } from './site-api.ts';
export async function cmdCraft(env: Env, options: InteractionOption[] | undefined): Promise<MessageData> {
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
    if (result.reason === 'missing-price') {
      const missing = [
        ...result.missingCities,
        ...(result.missingSalePrice ? [`produto em ${sellCity}`] : []),
      ];
      return {
        content: `⚠️ Dados de mercado incompletos para **${name}**; sem lucro calculado.${missing.length ? ` Faltam preços para: ${missing.join(', ')}.` : ''}`,
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
        thumbnail: { url: iconUrl(id, 64) },
        fields,
        footer: {
          text: `Compra em ${buyCity} · Venda em ${sellCity} · RRR ${D(rrr * 100, 1)}% · Impostos base (${SALES_TAX_PCT}% + ${SETUP_FEE_PCT}%)`,
        },
      },
    ],
  };
}
