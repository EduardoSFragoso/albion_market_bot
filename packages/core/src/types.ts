// Shared types for the Albion market tools.

export interface ItemIndexEntry {
  id: string;
  en: string;
  pt: string;
  tier: number;
  ench: number;
  cat: string;
  craftable: 0 | 1;
}

export interface RecipeResource {
  id: string;
  count: number;
}

export interface Recipe {
  resources: RecipeResource[];
  amount: number;
  silver: number;
}

// ---- Market API (AODP) ----

export interface MarketPrice {
  item_id: string;
  city: string;
  quality: number;
  sell_price_min: number;
  sell_price_min_date: string;
  sell_price_max: number;
  buy_price_min: number;
  buy_price_min_date: string;
  buy_price_max: number;
  buy_price_max_date: string;
}

export interface HistoryPoint {
  item_count: number;
  avg_price: number;
  timestamp: string;
}

export interface LocationHistory {
  location: string;
  item_id: string;
  quality: number;
  data: HistoryPoint[];
}
