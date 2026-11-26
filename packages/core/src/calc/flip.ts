// Flip / arbitrage margins: buy in one city, sell in another (incl. Black Market).
import type { MarketPrice, Recipe } from '../types';
import type { CraftSettings, PriceMode } from './craft';
import { effectiveResourceCount, unitPrice, livePrice } from './craft';
import { recipeOptions } from '../items';

export interface FlipResult {
  buyCity: string;
  sellCity: string;
  buyMode: PriceMode;
  sellMode: PriceMode;
  buyPrice: number;
  sellPrice: number;
  netPrice: number; // sellPrice after taxes
  profitPerUnit: number;
  profitPct: number;
  stale: boolean;
}

export interface FlipArgs {
  prices: MarketPrice[];
  settings: Pick<CraftSettings, 'salesTaxPct' | 'setupFeePct'>;
  buyMode?: PriceMode;
  sellMode?: PriceMode;
  skipLocations?: string[];
}

/** Best flip for one item across all scanned prices. */
export function calcBestFlip(args: FlipArgs): FlipResult | null {
  const buyMode = args.buyMode ?? 'instant';
  const sellMode = args.sellMode ?? 'order';
  const skip = new Set(args.skipLocations ?? []);
  const live = args.prices.filter((p) => livePrice(p) && !skip.has(p.city));
  if (!live.length) return null;

  let best: FlipResult | null = null;
  const byCity = new Map<string, MarketPrice[]>();
  for (const p of live) {
    if (!byCity.has(p.city)) byCity.set(p.city, []);
    byCity.get(p.city)!.push(p);
  }

  for (const [buyCity, bps] of byCity) {
    for (const [sellCity, sps] of byCity) {
      let bp = bps.find((p) => p.quality === 1);
      if (!bp) bp = bps[0];
      let sp = sps.find((p) => p.quality === 1);
      if (!sp) sp = sps[0];
      if (!bp || !sp) continue;
      const buyPrice = unitPrice(bp, buyMode, 'buy');
      const sellPrice = unitPrice(sp, sellMode, 'sell');
      if (buyPrice <= 0 || sellPrice <= 0) continue;
      const netPrice = sellPrice * (1 - args.settings.salesTaxPct / 100) * (1 - args.settings.setupFeePct / 100);
      const profitPerUnit = netPrice - buyPrice;
      const r: FlipResult = {
        buyCity, sellCity, buyMode, sellMode,
        buyPrice, sellPrice, netPrice,
        profitPerUnit,
        profitPct: buyPrice > 0 ? profitPerUnit / buyPrice : 0,
        stale: false,
      };
      if (!best || r.profitPerUnit > best.profitPerUnit) best = r;
    }
  }
  return best;
}

/** Traditional market flip: buy instant, sell with an order, between two specific cities. */
export function calcFlipBetween(
  prices: MarketPrice[],
  buyCity: string,
  sellCity: string,
  settings: Pick<CraftSettings, 'salesTaxPct' | 'setupFeePct'>,
): FlipResult | null {
  const bp = prices.find((p) => p.city === buyCity && p.quality === 1 && livePrice(p))
    ?? prices.find((p) => p.city === buyCity && livePrice(p));
  const sp = prices.find((p) => p.city === sellCity && p.quality === 1 && livePrice(p))
    ?? prices.find((p) => p.city === sellCity && livePrice(p));
  if (!bp || !sp) return null;
  const buyPrice = unitPrice(bp, 'instant', 'buy');
  const sellPrice = unitPrice(sp, 'order', 'sell');
  if (!sellPrice) return null;
  const netPrice = sellPrice * (1 - settings.salesTaxPct / 100) * (1 - settings.setupFeePct / 100);
  return {
    buyCity, sellCity,
    buyMode: 'instant', sellMode: 'order',
    buyPrice, sellPrice, netPrice,
    profitPerUnit: netPrice - buyPrice,
    profitPct: buyPrice > 0 ? (netPrice - buyPrice) / buyPrice : 0,
    stale: false,
  };
}

/** Ingrediente mais barato em qualquer cidade viva (menos Black Market) + custo RRR da receita. */
export function craftMaterialCost(
  recipe: Recipe,
  rows: MarketPrice[], // prices quality-1 de TODOS os ingredientes
  opts: { buyMode: PriceMode; rrr: number },
): { cost: number; missing: string[]; cities: string; recipe: Recipe } {
  const options = recipeOptions(recipe).map((candidate) => {
    const cheapest = cheapestCityFor(candidate, rows, opts.buyMode);
    const missing = cheapest.filter((c) => c.unitPrice <= 0).map((c) => c.id);
    const total = cheapest.reduce((s, c, i) => s + c.unitPrice * effectiveResourceCount(candidate.resources[i], opts.rrr), 0) + candidate.silver;
    const cities = [...new Set(cheapest.map((c) => (c.city === '—' ? [] : [c.city])).flat())].join('+');
    return { recipe: candidate, cheapest, missing, total, unitCost: total / (candidate.amount || 1), cities };
  });
  const selected = options.reduce((best, candidate) =>
    candidate.missing.length < best.missing.length ||
    (candidate.missing.length === best.missing.length && candidate.unitCost < best.unitCost)
      ? candidate
      : best,
  );
  return {
    cost: selected.missing.length === selected.recipe.resources.length ? 0 : selected.total / (selected.recipe.amount || 1),
    missing: selected.missing,
    cities: selected.cities || '—',
    recipe: selected.recipe,
  };
}

/** Which ingredients can be bought cheapest where — for craft planning. */
export function cheapestCityFor(recipe: Recipe, prices: MarketPrice[], buyMode: PriceMode = 'instant'): { id: string; city: string; unitPrice: number }[] {
  return recipe.resources.map((r) => {
    const rows = prices.filter((p) => p.item_id === r.id && livePrice(p) && p.city !== 'Black Market');
    let bestCity = '';
    let best = Infinity;
    for (const row of rows) {
      const u = unitPrice(row, buyMode, 'buy');
      if (u > 0 && u < best) {
        best = u;
        bestCity = row.city;
      }
    }
    return { id: r.id, city: bestCity || '—', unitPrice: best === Infinity ? 0 : best };
  });
}
