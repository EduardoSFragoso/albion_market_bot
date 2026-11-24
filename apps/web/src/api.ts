// typed client for /api/*
import type { MarketPrice, LocationHistory, ItemIndexEntry, RankResult } from '@albion/core';

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
  recipe: { resources: { id: string; count: number }[]; amount: number } | null;
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
  };
  cheapest?: { id: string; city: string; unitPrice: number }[];
  error?: string;
}

export const api = {
  prices: (itemId: string, qualities = 1) =>
    get<{ prices: MarketPrice[] }>(`/api/prices?items=${encodeURIComponent(itemId)}&qualities=${qualities}`),
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
};

export type { MarketPrice, LocationHistory, ItemIndexEntry };
