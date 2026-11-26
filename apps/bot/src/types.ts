export interface ItemIndexEntry {
  id: string;
  en: string;
  pt: string;
  tier: number;
  ench: number;
  cat: string;
  craftable: 0 | 1;
}

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

export interface FlipResult {
  buyCity: string;
  sellCity: string;
  buyMode: 'instant' | 'order';
  sellMode: 'instant' | 'order';
  buyPrice: number;
  sellPrice: number;
  netPrice: number;
  profitPerUnit: number;
  profitPct: number;
  stale: boolean;
}

export interface CraftResult {
  ok: boolean;
  reason?: string;
  outputId: string;
  amountPerCraft: number;
  materials: Array<{
    id: string;
    countPerCraft: number;
    effectiveCount: number;
    unitPrice: number;
    cost: number;
    missingPrice: boolean;
  }>;
  materialCost: number;
  totalCost: number;
  salePrice: number;
  revenue: number;
  profit: number;
  profitPctOfCost: number;
  missingCities: string[];
  missingSalePrice?: boolean;
}

export interface RankEntry {
  itemId: string;
  en: string;
  pt: string;
  tier: number;
  ench: number;
  materialCost: number;
  salePrice: number;
  netPrice: number;
  profit: number;
  profitPct: number;
}

export interface RankResponse {
  universeSize: number;
  entries: RankEntry[];
  error?: string;
}

export interface EnchantRow {
  ench: number;
  outputId: string;
  en: string;
  pt: string;
  hasRecipe: boolean;
  buyPrice: number | null;
  buyCity: string | null;
  craftCost: number | null;
  craftCities: string;
  missing: string[];
  cheaper: 'buy' | 'craft' | null;
  savings: number | null;
  savingsPct: number | null;
}

export interface EnchantResponse {
  server: string;
  baseId: string;
  rows: EnchantRow[];
  error?: string;
}
export interface InteractionOption {
  name: string;
  value: string | number | boolean;
  type: number;
}

export interface Interaction {
  type: number; // 1 = PING, 2 = APPLICATION_COMMAND
  application_id?: string;
  token?: string; // interaction token — basta para followup, sem bot token
  data?: {
    id: string;
    name: string;
    options?: InteractionOption[];
  };
}
export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface Embed {
  title?: string;
  description?: string;
  color?: number;
  fields?: EmbedField[];
  thumbnail?: { url: string };
  footer?: { text: string };
}

export interface MessageData {
  content?: string;
  embeds?: Embed[];
  flags?: number;
}

export interface Env {
  SITE_URL: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
}
