// typed client for /api/*
import type { MarketPrice, LocationHistory, ItemIndexEntry, RankResult, EnchantRow, RecipeTreeIngredient } from '@albion/core';

const SEARCH_CACHE_TTL_MS = 60_000;
const SEARCH_CACHE_MAX = 50;
const searchCache = new Map<string, { expiresAt: number; results: ItemIndexEntry[] }>();

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error ?? `${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface CraftResponse {
  server: string;
  item: ItemIndexEntry;
  recipe: { resources: RecipeTreeIngredient[]; amount: number; silver: number } | null;
  buyCity: string;
  sellCity: string;
  result?: {
    ok: boolean;
    reason?: string;
    amountPerCraft: number;
    materials: { id: string; countPerCraft: number; effectiveCount: number; unitPrice: number; cost: number; missingPrice: boolean; usedCity?: string; fallbackCity?: string }[];
    materialCost: number;
    totalCost: number;
    salePrice: number;
    revenue: number;
    profit: number;
    profitPctOfCost: number;
    missingCities: string[];
    missingSalePrice?: boolean;
  };
  cheapest?: { id: string; city: string; unitPrice: number }[];
  error?: string;
}

export const api = {
  search: async (query: string, locale: 'pt' | 'en', limit = 10) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [] as ItemIndexEntry[];
    const key = `${locale}:${limit}:${normalized}`;
    const cached = searchCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.results;
    if (cached) searchCache.delete(key);
    const p = new URLSearchParams({ q: query, locale, limit: String(limit) });
    const { results } = await get<{ results: ItemIndexEntry[] }>(`/api/search?${p}`);
    searchCache.set(key, { results, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
    if (searchCache.size > SEARCH_CACHE_MAX) {
      const oldest = searchCache.keys().next().value;
      if (oldest) searchCache.delete(oldest);
    }
    return results;
  },
  prices: (itemId: string, qualities = 1) =>
    get<{ prices: MarketPrice[] }>(`/api/prices?items=${encodeURIComponent(itemId)}&qualities=${qualities}`),
  flip: (args: { item: string; salesTax: number; setupFee: number }) => {
    const p = new URLSearchParams({ item: args.item, salesTax: String(args.salesTax), setupFee: String(args.setupFee) });
    return get<{ prices: MarketPrice[]; best: import('@albion/core').FlipResult | null }>(`/api/flip?${p}`);
  },
  craft: (args: { item: string; buyCity: string; sellCity: string; rrr: number; buyMode: 'instant' | 'order'; salesTax: number; setupFee: number }) => {
    const p = new URLSearchParams({ item: args.item, buyCity: args.buyCity, sellCity: args.sellCity, rrr: String(args.rrr), buyMode: args.buyMode, salesTax: String(args.salesTax), setupFee: String(args.setupFee) });
    return get<CraftResponse>(`/api/craft?${p}`);
  },
  history: (itemId: string, days = 14) =>
    get<{ history: LocationHistory[] }>(`/api/history?item=${encodeURIComponent(itemId)}&days=${days}&timeScale=24&qualities=1`),
  rank: (args: { tierMin: number; tierMax: number; enchants: '' | string; sellCity: string; buyMode: 'instant' | 'order'; rrr: number; salesTax: number; setupFee: number; topN?: number }) => {
    const p = new URLSearchParams({
      tierMin: String(args.tierMin), tierMax: String(args.tierMax), sellCity: args.sellCity,
      buyMode: args.buyMode, rrr: String(args.rrr), salesTax: String(args.salesTax), setupFee: String(args.setupFee),
      topN: String(args.topN ?? 100),
    });
    if (args.enchants) p.set('enchants', args.enchants);
    return get<RankResult>(`/api/rank?${p}`);
  },
  enchant: (args: { item: string; rrr: number; buyMode: 'instant' | 'order' }) =>
    get<{ server: string; baseId: string; rows: EnchantRow[] }>(
      `/api/enchant?item=${encodeURIComponent(args.item)}&rrr=${args.rrr}&buyMode=${args.buyMode}`,
    ),
};

export type { MarketPrice, LocationHistory, ItemIndexEntry };
