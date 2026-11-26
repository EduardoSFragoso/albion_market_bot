// Client for the Albion Online Data Project (AODP) REST API.
// Docs: https://www.albion-online-data.com/api-docs  (server: west|east|europe)
// Be a good citizen: compress, cache, batch item ids.
import type { LocationHistory, MarketPrice } from './types';

export type AodpServer = 'west' | 'east' | 'europe';

const HOSTS: Record<AodpServer, string> = {
  west: 'https://west.albion-online-data.com',
  east: 'https://east.albion-online-data.com',
  europe: 'https://europe.albion-online-data.com',
};

export const MAIN_CITIES = [
  'Thetford',
  'Fort Sterling',
  'Lymhurst',
  'Bridgewatch',
  'Martlock',
  'Caerleon',
  'Brecilien',
  'Black Market',
] as const;

// in-memory cache (survives across requests within a warm isolate)
type CacheEntry = { at: number; value: unknown };
const MAX_CACHE_ENTRIES = 256;
const MAX_IN_FLIGHT_REQUESTS = 64;
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) {
    // Keep frequently reused entries from being evicted before cold keys.
    cache.delete(key);
    cache.set(key, hit);
    return hit.value as T;
  }
  if (hit) cache.delete(key);

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;
  if (inFlight.size >= MAX_IN_FLIGHT_REQUESTS) {
    throw new Error('AODP concurrent request limit reached');
  }

  const request = Promise.resolve()
    .then(fn)
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      while (cache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey === undefined) break;
        cache.delete(oldestKey);
      }
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

export interface PricesOptions {
  locations?: string[];
  qualities?: number[];
  ttlMs?: number;
}

/** Current sell/buy prices for one or more item ids. */
export async function fetchPrices(
  server: AodpServer,
  itemIds: string[],
  opts: PricesOptions = {},
): Promise<MarketPrice[]> {
  const ids = itemIds.map((i) => encodeURIComponent(i.trim())).join(',');
  if (!ids) return [];
  const locations = (opts.locations?.length ? opts.locations : [...MAIN_CITIES]).join(',');
  const qualities = opts.qualities?.length ? opts.qualities.join(',') : '1';
  const url = `${HOSTS[server]}/api/v2/stats/prices/${ids}?locations=${encodeURIComponent(locations)}&qualities=${qualities}`;
  return cached(`prices:${server}:${url}`, opts.ttlMs ?? 90_000, async () => {
    const res = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
    if (!res.ok) throw new Error(`AODP prices ${res.status}`);
    return (await res.json()) as MarketPrice[];
  });
}

export interface HistoryOptions {
  locations?: string[];
  qualities?: number[];
  timeScale?: 1 | 6 | 24;
  days?: number;
  ttlMs?: number;
}

/** Historical price/volume data for the last `days` days. */
export async function fetchHistory(
  server: AodpServer,
  itemIds: string[],
  opts: HistoryOptions = {},
): Promise<LocationHistory[]> {
  const ids = itemIds.map((i) => encodeURIComponent(i.trim())).join(',');
  if (!ids) return [];
  const end = new Date();
  const start = new Date(Date.now() - (opts.days ?? 14) * 86_400_000);
  const loc = (opts.locations?.length ? opts.locations : [...MAIN_CITIES]).join(',');
  const qualities = opts.qualities?.length ? opts.qualities.join(',') : '1';
  const url =
    `${HOSTS[server]}/api/v2/stats/history/${ids}` +
    `?locations=${encodeURIComponent(loc)}&time-scale=${opts.timeScale ?? 24}` +
    `&qualities=${qualities}&time-stamps=${start.toISOString().slice(0, 10)}&end-time-stamps=${end.toISOString().slice(0, 10)}`;
  return cached(`history:${server}:${url}`, opts.ttlMs ?? 600_000, async () => {
    const res = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
    if (!res.ok) throw new Error(`AODP history ${res.status}`);
    return (await res.json()) as LocationHistory[];
  });
}

export interface GoldPrice {
  id: number;
  price: number;
  timestamp: string;
}

/** Latest gold price (silver per gold). */
export async function fetchGold(server: AodpServer, count = 2): Promise<GoldPrice[]> {
  const url = `${HOSTS[server]}/api/v2/stats/goldcount?count=${count}`;
  return cached(`gold:${server}`, 300_000, async () => {
    const res = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
    if (!res.ok) throw new Error(`AODP gold ${res.status}`);
    return (await res.json()) as GoldPrice[];
  });
}
