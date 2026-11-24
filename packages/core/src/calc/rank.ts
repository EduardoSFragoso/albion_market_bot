// Mass opportunity ranking ("Oportunidades"): score craftable items by craft profit.
// No new business rules here: price conventions (unitPrice/livePrice), the
// cheapest-material-city rule (cheapestCityFor) and taxes all live in calc/craft.ts
// and calc/flip.ts. This module only adds batch specifics: universe selection,
// chunked price fetching (AODP throttle + Cloudflare subrequest limits) and scoring.
import type { ItemIndexEntry, MarketPrice, Recipe } from '../types';
import { ITEMS, RECIPES } from '../items';
import { unitPrice, livePrice, type PriceMode } from './craft';
import { cheapestCityFor } from './flip';
import { fetchPrices, MAIN_CITIES, type AodpServer } from '../api';

export interface RankOptions {
  server: AodpServer;
  minTier?: number; // default 4
  maxTier?: number; // default 6
  enchants?: number[]; // default [0]
  categories?: string[]; // keep only these cats (default: all)
  excludeCategories?: string[];
  maxItems?: number; // universe cap in deterministic order (default 1200)
  requireComplete?: boolean; // skip items with ANY missing ingredient price (default true — prevents unpriced materials looking like free profit)
  cities?: string[]; // scanned cities (default MAIN_CITIES)
  buyMode?: PriceMode; // how materials are acquired (default 'instant')
  sellCity?: string | 'best'; // sale target; 'best' = max instant-sell across cities (default 'Black Market')
  rrr?: number; // default 0.152 (base)
  salesTaxPct?: number; // default 8
  setupFeePct?: number; // default 2.5
  chunkSize?: number; // item ids per price request (default 200)
  concurrency?: number; // parallel chunk fetches (default 4; keep small for AODP)
  ttlMs?: number; // price cache TTL (default 90s)
  topN?: number; // entries returned, sorted by profitPct desc (default 100)
}

export interface RankEntry {
  itemId: string;
  en: string;
  pt: string;
  tier: number;
  ench: number;
  cat: string;
  sellCity: string;
  buyCity: string; // summary of material sources ('—' when none priced / mixed)
  materialCost: number; // per unit, cheapest live cities, RRR-adjusted
  salePrice: number; // instant sale (buy_price_max) at sellCity
  netPrice: number; // after taxes
  profit: number; // per unit
  profitPct: number; // profit / materialCost
  missing: string[]; // ingredients with no live price
}

export interface RankResult {
  universeSize: number; // items matching filters, before cap
  scanned: number; // items scored (had at least one priced ingredient)
  skippedMissing: number; // items skipped: no ingredient priced at all
  chunks: number; // price requests made
  entries: RankEntry[];
  paramsOk: {
    buyMode: PriceMode;
    sellCity: string;
    rrr: number;
    salesTaxPct: number;
    setupFeePct: number;
    cities: string[];
  };
}

/** Items that can be scored, in deterministic order (tier asc, then id). */
export function rankUniverse(opts: Pick<RankOptions, 'minTier' | 'maxTier' | 'enchants' | 'categories' | 'excludeCategories' | 'maxItems'> = {}): ItemIndexEntry[] {
  const minTier = opts.minTier ?? 4;
  const maxTier = opts.maxTier ?? 6;
  const enchants = new Set(opts.enchants?.length ? opts.enchants : [0]);
  const cats = opts.categories?.length ? new Set(opts.categories) : null;
  const excl = new Set(opts.excludeCategories ?? []);
  const universe = ITEMS.filter(
    (i) =>
      i.craftable === 1 &&
      !!RECIPES[i.id] &&
      i.tier >= minTier &&
      i.tier <= maxTier &&
      enchants.has(i.ench) &&
      (!cats || cats.has(i.cat)) &&
      !excl.has(i.cat),
  ).sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
  return universe.slice(0, opts.maxItems ?? 1200);
}

/**
 * Score ONE item against prices for its output + ingredients (quality 1 rows).
 * Exported pure so tests can feed fictional prices with known results.
 */
export function scoreCraftItem(
  item: ItemIndexEntry,
  recipe: Recipe,
  prices: MarketPrice[],
  opts: Required<Pick<RankOptions, 'buyMode' | 'sellCity' | 'rrr' | 'salesTaxPct' | 'setupFeePct' | 'requireComplete'>>,
): RankEntry | null {
  const rows = prices.filter((p) => p.quality === 1);
  const cheapest = cheapestCityFor(recipe, rows, opts.buyMode);
  const missing = cheapest.filter((c) => c.unitPrice <= 0).map((c) => c.id);
  if (missing.length === recipe.resources.length) return null; // nothing priced at all
  if (opts.requireComplete && missing.length) return null;

  const materialCost =
    cheapest.reduce((s, c, i) => s + c.unitPrice * recipe.resources[i].count * (1 - opts.rrr), 0) /
    (recipe.amount || 1);

  // Sale: instant sell (buy_price_max) at sellCity, or best live bid across cities.
  const outRows = rows.filter((p) => p.item_id === item.id && livePrice(p));
  let sellCity = opts.sellCity === 'best' ? '' : opts.sellCity;
  let salePrice = 0;
  for (const p of outRows) {
    if (opts.sellCity !== 'best' && p.city !== opts.sellCity) continue;
    const u = unitPrice(p, 'instant', 'sell');
    if (u > salePrice) {
      salePrice = u;
      if (opts.sellCity === 'best') sellCity = p.city;
    }
  }
  if (salePrice <= 0 || materialCost <= 0) return null;

  const netPrice = salePrice * (1 - opts.salesTaxPct / 100) * (1 - opts.setupFeePct / 100);
  const profit = netPrice - materialCost;
  const buyCity = [...new Set(cheapest.map((c) => (c.city === '—' ? [] : [c.city])).flat())].join('+') || '—';

  return {
    itemId: item.id, en: item.en, pt: item.pt,
    tier: item.tier, ench: item.ench, cat: item.cat,
    sellCity, buyCity,
    materialCost, salePrice, netPrice,
    profit,
    profitPct: profit / materialCost,
    missing,
  };
}

export async function rankOpportunities(opts: RankOptions): Promise<RankResult> {
  const cities = opts.cities?.length ? opts.cities : [...MAIN_CITIES];
  const buyMode = opts.buyMode ?? 'instant';
  const sellCity = opts.sellCity ?? 'Black Market';
  const rrr = opts.rrr ?? 0.152;
  const salesTaxPct = opts.salesTaxPct ?? 8;
  const setupFeePct = opts.setupFeePct ?? 2.5;
  const chunkSize = Math.max(1, opts.chunkSize ?? 200);
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const topN = Math.max(1, opts.topN ?? 100);

  const universe = rankUniverse(opts);
  const recipeOf = (id: string): Recipe | undefined => RECIPES[id];
  const ingIds = new Set<string>();
  for (const item of universe) {
    for (const r of recipeOf(item.id)!.resources) ingIds.add(r.id);
  }
  const ids = [...new Set([...universe.map((i) => i.id), ...ingIds])];

  const chunksCount = Math.ceil(ids.length / chunkSize);
  const byId = new Map<string, MarketPrice[]>();
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < chunksCount) {
      const idx = next++;
      const c = ids.slice(idx * chunkSize, (idx + 1) * chunkSize);
      for (const p of await fetchPrices(opts.server, c, { locations: cities, qualities: [1], ttlMs: opts.ttlMs })) {
        const arr = byId.get(p.item_id);
        if (arr) arr.push(p);
        else byId.set(p.item_id, [p]);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunksCount) }, worker));

  const scored: RankEntry[] = [];
  let skippedMissing = 0;
  for (const item of universe) {
    const recipe = recipeOf(item.id)!;
    // scoreCraftItem precisa das linhas de TODOS os ids (output + ingredientes) — não
    // só do item: cheapestCityFor escolhe a cidade dos ingredientes a partir delas.
    const rows: MarketPrice[] = [];
    const push = (id: string): void => {
      const arr = byId.get(id);
      if (arr) rows.push(...arr);
    };
    push(item.id);
    for (const r of recipe.resources) push(r.id);
    const entry = scoreCraftItem(item, recipe, rows, {
      buyMode, sellCity, rrr, salesTaxPct, setupFeePct,
      requireComplete: opts.requireComplete !== false,
    });
    if (entry) scored.push(entry);
    else skippedMissing++;
  }
  scored.sort((a, b) => b.profitPct - a.profitPct || b.profit - a.profit || a.itemId.localeCompare(b.itemId));

  return {
    universeSize: universe.length,
    scanned: scored.length + skippedMissing,
    skippedMissing,
    chunks: chunksCount,
    entries: scored.slice(0, topN),
    paramsOk: { buyMode, sellCity, rrr, salesTaxPct, setupFeePct, cities },
  };
}
