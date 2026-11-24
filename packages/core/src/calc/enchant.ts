// Comprar o item encantado pronto vs. craftar (materiais + runas/souls/relics).
// Sem regra nova de negócio: usa craftMaterialCost (cheapest city, NÃO Black Market
// como fonte de material, RRR) e as convenções de preço do calc/craft.ts.
// Único detalhe próprio: comprar pronto olha a menor OFERTA viva (sell_price_min)
// em qualquer cidade — incluir Black Market é legítimo p/ COMPRAR (jogadores
// despejam ofertas lá; excluí-lo só vale p/ vender pro NPC).
import type { MarketPrice } from '../types';
import { getItem, RECIPES } from '../items';
import { livePrice, type PriceMode } from './craft';
import { craftMaterialCost } from './flip';

export interface EnchantRow {
  ench: number;
  outputId: string;
  en: string;
  pt: string;
  hasRecipe: boolean;
  buyPrice: number | null; // menor oferta viva instantânea (qualquer cidade, incl. Black Market); null = sem dado vivo
  buyCity: string | null;
  craftCost: number | null; // craftar: custo por unidade (materiais mais baratos, RRR); null = sem receita ou nenhum preço
  craftCities: string;
  missing: string[]; // ingredientes sem preço recente
  cheaper: 'buy' | 'craft' | null;
  savings: number | null; // craftCost - buyPrice (positivo: craftar sai mais caro)
  savingsPct: number | null; // |savings| sobre a opção mais barata
}

/** id base sem sufixo @n. */
export const enchantBaseId = (id: string): string => id.replace(/@\d+$/, '');
export const enchantFamilyId = (baseId: string, ench: number): string => (ench > 0 ? `${baseId}@${ench}` : baseId);

/** ids existentes da família de encantamento (ex.: T4_BAG → T4_BAG, T4_BAG@1..@3). */
export function enchantFamilyIds(id: string): string[] {
  const base = enchantBaseId(id);
  return [0, 1, 2, 3].map((n) => enchantFamilyId(base, n)).filter((x) => !!getItem(x));
}

/**
 * Compara comprar pronto vs. craftar para cada nível de encantamento existente da
 * família do item. Prices devem trazer q1 da saída E dos ingredientes (o endpoint
 * monta a lista de ids; pure callable com dados fictícios p/ testes).
 */
export function compareEnchants(
  id: string,
  prices: MarketPrice[],
  opts: { buyMode: PriceMode; rrr: number },
): EnchantRow[] {
  const base = enchantBaseId(id);
  const rows: EnchantRow[] = [];
  for (const n of [0, 1, 2, 3]) {
    const outputId = enchantFamilyId(base, n);
    const item = getItem(outputId);
    if (!item) continue;

    const live = prices.filter((p) => p.item_id === outputId && p.quality === 1 && livePrice(p));
    let buyPrice: number | null = null;
    let buyCity = '';
    for (const p of live) {
      if (p.sell_price_min > 0 && (buyPrice === null || p.sell_price_min < buyPrice)) {
        buyPrice = p.sell_price_min;
        buyCity = p.city;
      }
    }

    const recipe = RECIPES[outputId];
    let craftCost: number | null = null;
    let craftCities = '—';
    let missing: string[] = [];
    if (recipe) {
      const ing = craftMaterialCost(recipe, prices, opts);
      craftCities = ing.cities;
      missing = ing.missing;
      if (ing.cost > 0 && ing.missing.length === 0) craftCost = ing.cost;
    }

    let cheaper: 'buy' | 'craft' | null = null;
    let savings: number | null = null;
    let savingsPct: number | null = null;
    if (buyPrice !== null && craftCost !== null) {
      savings = craftCost - buyPrice; // positivo: craftar custa mais
      if (savings === 0) cheaper = null;
      else cheaper = savings > 0 ? 'buy' : 'craft';
      savingsPct = Math.abs(savings) / Math.min(buyPrice, craftCost);
    }

    rows.push({
      ench: n, outputId, en: item.en, pt: item.pt,
      hasRecipe: !!recipe,
      buyPrice, buyCity: buyPrice !== null ? buyCity : null,
      craftCost, craftCities, missing,
      cheaper, savings, savingsPct,
    });
  }
  return rows;
}
