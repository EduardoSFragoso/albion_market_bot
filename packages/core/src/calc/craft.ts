// Craft cost & profit calculator.
// Conventions:
//   - Instant buy  -> pay the cheapest offer  (sell_price_min)
//   - Buy order fill -> fill the highest bid  (buy_price_max)
//   - Instant sell -> match the highest bid   (buy_price_max)
//   - Sell order   -> match the cheapest offer(sell_price_min)
//   - Resource Return Rate (RRR) reduces average inputs per craft over many crafts.
import type { Recipe, MarketPrice } from '../types';
import { getRecipe } from '../items';

export type PriceMode = 'instant' | 'order';

export interface CraftSettings {
  rrr: number; // 0..0.5, e.g. 0.152 base, 0.248 bonus city, 0.435 Caerleon
  buyMode: PriceMode; // how the crafter acquires materials
  salesTaxPct: number; // 8 base / 4 premium
  setupFeePct: number; // 2.5 base / 1.5 premium
  returnRateOnByproducts?: boolean; // legacy, unused
}

export const RRR_PRESETS = {
  base: 0.152,
  bonusCity: 0.248,
  caerleon: 0.435,
} as const;

export const SALES_TAX = { base: 8, premium: 4 } as const;
export const SETUP_FEE = { base: 2.5, premium: 1.5 } as const;

function unitPrice(p: MarketPrice | undefined, mode: PriceMode, side: 'buy' | 'sell'): number {
  if (!p) return 0;
  if (side === 'buy') return mode === 'instant' ? p.sell_price_min : p.buy_price_max;
  return mode === 'instant' ? p.buy_price_max : p.sell_price_min;
}

export interface CraftResult {
  ok: boolean;
  reason?: string;
  outputId: string;
  amountPerCraft: number;
  materials: Array<{
    id: string;
    countPerCraft: number;
    effectiveCount: number; // after RRR
    unitPrice: number;
    cost: number;
    missingPrice: boolean;
    usedCity?: string;
    fallbackCity?: string; // set when buyCity had no live price and another city was used
  }>;
  materialCost: number; // silver per craft (RRR-adjusted; per unit of output — all current recipes craft 1)
  totalCost: number; // = materialCost (taxes are taken on the revenue side)
  salePrice: number; // per unit (instant sell vs sell order)
  revenue: number; // salePrice * amount * (1 - salesTax)
  profit: number; // revenue - totalCost
  profitPctOfCost: number;
  missingCities: string[];
  missingSalePrice?: boolean;
}

export interface CraftCalcArgs {
  itemId: string;
  recipe?: Recipe;
  prices: Array<MarketPrice>; // all locations & quality=1 for the ingredient + output ids
  buyCity: string;
  sellCity: string;
  settings: CraftSettings;
}

export function calcCraft(args: CraftCalcArgs): CraftResult {
  const { itemId, prices, buyCity, sellCity, settings } = args;
  const recipe = args.recipe ?? getRecipe(itemId);
  if (!recipe) {
    return { ok: false, reason: 'no-recipe', outputId: itemId, amountPerCraft: 1, materials: [], materialCost: 0, totalCost: 0, salePrice: 0, revenue: 0, profit: 0, profitPctOfCost: 0, missingCities: [] };
  }

  const outs = prices.filter((p) => p.item_id === itemId && p.city === sellCity);
  const outPrice = outs.find((p) => p.quality === 1 && livePrice(p) && unitPrice(p, 'instant', 'sell') > 0)
    ?? outs.find((p) => livePrice(p) && unitPrice(p, 'instant', 'sell') > 0);

  const missingCities: string[] = [];
  const materials = recipe.resources.map((r) => {
    const candidates = prices.filter((p) => p.item_id === r.id && p.city === buyCity);
    let p = candidates.find((x) => x.quality === 1 && livePrice(x));
    if (!p) p = candidates.find((x) => livePrice(x));
    let fallbackCity: string | undefined;

    // fallback: if buyCity has no live price, use the cheapest live price in any other city
    // (prevents silently computing a 0 cost with inflated profit)
    if (!p || unitPrice(p, settings.buyMode, 'buy') <= 0) {
      const others = prices
        .filter((x) => x.item_id === r.id && x.city !== 'Black Market' && livePrice(x))
        .map((x) => ({ x, u: unitPrice(x, settings.buyMode, 'buy') }))
        .filter((o) => o.u > 0)
        .sort((a, b) => a.u - b.u);
      if (others.length) {
        p = others[0].x;
        fallbackCity = p.city;
      }
    }

    const unit = unitPrice(p, settings.buyMode, 'buy');
    if (!p || unit <= 0) missingCities.push(r.id);
    return {
      id: r.id,
      countPerCraft: r.count,
      effectiveCount: r.count * (1 - settings.rrr),
      unitPrice: unit,
      cost: unit * r.count * (1 - settings.rrr),
      missingPrice: !p || unit <= 0,
      usedCity: p?.city,
      fallbackCity,
    };
  });

  const materialCost = materials.reduce((s, m) => s + m.cost, 0) / (recipe.amount || 1);
  const salePrice = unitPrice(outPrice, 'instant', 'sell');
  const missingSalePrice = salePrice <= 0;
  // revenue applies both taxes, matching the flip calculator and the bot's /lucro
  // (sales tax 8%/4% + order setup fee 2.5%/1.5%) — see user spec.
  const revenue = salePrice * recipe.amount * (1 - settings.salesTaxPct / 100) * (1 - settings.setupFeePct / 100);
  const totalCost = materialCost;
  const profit = revenue - totalCost;

  return {
    ok: missingCities.length === 0 && !missingSalePrice,
    ...((missingCities.length > 0 || missingSalePrice) ? { reason: 'missing-price' } : {}),
    outputId: itemId,
    amountPerCraft: recipe.amount,
    materials,
    materialCost,
    totalCost,
    salePrice,
    revenue,
    profit,
    profitPctOfCost: totalCost > 0 ? profit / totalCost : 0,
    missingCities,
    missingSalePrice,
  };
}

function livePrice(p: MarketPrice): boolean {
  const d = p.sell_price_min > 0 || p.buy_price_max > 0;
  if (!d) return false;
  // ignore data older than 7 days
  const src = p.sell_price_min > 0 ? p.sell_price_min_date : p.buy_price_max_date;
  if (!src || src.startsWith('0001-01-01')) return p.sell_price_min > 0 || p.buy_price_max > 0;
  return Date.now() - Date.parse(src + 'Z') < 7 * 86_400_000;
}

export { unitPrice, livePrice };
