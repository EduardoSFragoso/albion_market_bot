// typed client for /api/*
import type { MarketPrice, LocationHistory, ItemIndexEntry } from '@albion/core';

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
    materials: { id: string; countPerCraft: number; effectiveCount: number; unitPrice: number; cost: number; missingPrice: boolean }[];
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
};

export type { MarketPrice, LocationHistory, ItemIndexEntry };
