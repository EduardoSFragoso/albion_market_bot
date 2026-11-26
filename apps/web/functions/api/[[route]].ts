// NOTE: editing THIS file forces wrangler dev to rebuild; changing only packages/core
// (accessed via node_modules symlinks) does not trip the watcher in local dev.

// Pages Functions: /api/* — shared backend for the site and the Discord bot.
// Proxies the Albion Online Data Project API with caching and JSON contracts.
// Env var AODP_SERVER selects west (default) | east | europe.
import {
  fetchPrices, fetchHistory, searchItems, getItem, getRecipe,
  calcCraft, calcBestFlip, cheapestCityFor, rankOpportunities, compareEnchants, enchantFamilyIds, MAIN_CITIES,
} from '@albion/core';
import {
  isMarketItemId, isSearchQueryValid, MAX_LOCATIONS, MAX_PRICE_ITEMS,
  parseCommaList, parseQualities,
} from '../../api-validation';

interface Env {
  AODP_SERVER?: string;
  API_LIMITER?: Fetcher;
}

// absent/empty param -> default. (Number(null)+Number('') = 0, so guard explicitly.)
const num = (v: string | null, d: number) => {
  if (v === null || v.trim() === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const parseLocations = (v: string | null) =>
  parseCommaList(v, MAX_LOCATIONS, (location) => (MAIN_CITIES as readonly string[]).includes(location));
const isMainCity = (city: string) => (MAIN_CITIES as readonly string[]).includes(city);

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const server = (env.AODP_SERVER || 'west') as 'west' | 'east' | 'europe';

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  const bad = (msg: string, status = 400) => json({ error: msg }, status);
  const gateError = (status: 429 | 503, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        ...(status === 429 ? { 'retry-after': '60' } : {}),
      },
    });

  try {
    const clientIp = request.headers.get('CF-Connecting-IP')?.trim();
    if (!clientIp || !env.API_LIMITER) return gateError(503, 'rate limiter unavailable');

    let limitResponse: Response;
    try {
      limitResponse = await env.API_LIMITER.fetch('https://api-limiter.internal/check', {
        method: 'POST',
        headers: {
          'x-albion-client-ip': clientIp,
          'x-albion-route-class': path === '/rank' ? 'rank' : 'standard',
        },
      });
    } catch {
      return gateError(503, 'rate limiter unavailable');
    }
    if (limitResponse.status === 429) return gateError(429, 'rate limit exceeded');
    if (!limitResponse.ok) return gateError(503, 'rate limiter unavailable');

    if (path === '/') {
      return json({
        service: 'albion-market-api',
        server,
        endpoints: ['/api/search', '/api/prices', '/api/craft', '/api/flip', '/api/history', '/api/rank', '/api/enchant'],
      });
    }

    // Comprar pronto vs. craftar, por nível de encantamento (use o id base ou qualquer @n/LEVELn).
    if (path === '/enchant') {
      const itemParam = url.searchParams.get('item') ?? '';
      const baseId = itemParam.replace(/@\d+$/, '');
      if (!baseId || !getItem(baseId)) return bad('unknown item', 404);
      const buyMode = url.searchParams.get('buyMode') === 'order' ? 'order' : 'instant';
      const rrr = clamp(num(url.searchParams.get('rrr'), 0.152), 0, 0.6);

      const family = enchantFamilyIds(baseId);
      const ids = new Set<string>(family);
      for (const fid of family) {
        for (const r of getRecipe(fid)?.resources ?? []) ids.add(r.id);
      }
      const prices = await fetchPrices(server, [...ids], { locations: [...MAIN_CITIES], qualities: [1] });
      const rows = compareEnchants(baseId, prices, { buyMode, rrr });
      return json({ server, baseId, rows });
    }

    if (path === '/search') {
      const q = url.searchParams.get('q') ?? '';
      if (!isSearchQueryValid(q)) return bad('query too long');
      const localeParam = url.searchParams.get('locale');
      if (localeParam !== null && localeParam !== 'pt' && localeParam !== 'en') return bad('invalid locale');
      const locale = (localeParam ?? 'en') as 'pt' | 'en';
      const limit = clamp(num(url.searchParams.get('limit'), 12), 1, 30);
      if (!q.trim()) return json({ results: [] });
      return json({ results: searchItems(q, { locale, limit }) });
    }

    if (path === '/prices') {
      const items = parseCommaList(url.searchParams.get('items'), MAX_PRICE_ITEMS, isMarketItemId);
      if (items === null) return bad('invalid items');
      if (!items.length) return bad('missing items');
      const locations = parseLocations(url.searchParams.get('locations'));
      if (locations === null) return bad('invalid locations');
      const qualities = parseQualities(url.searchParams.get('qualities'));
      if (qualities === null) return bad('invalid qualities');
      const prices = await fetchPrices(server, items, { locations, qualities: qualities.length ? qualities : [1] });
      return json({ server, prices });
    }

    if (path === '/craft') {
      const itemId = url.searchParams.get('item') ?? '';
      const item = getItem(itemId);
      const recipe = getRecipe(itemId);
      if (!item) return bad('unknown item', 404);
      if (!recipe) return json({ item, recipe: null, error: 'no-recipe' });

      const buyCity = url.searchParams.get('buyCity') || 'Caerleon';
      const sellCity = url.searchParams.get('sellCity') || 'Black Market';
      if (!isMainCity(buyCity) || !isMainCity(sellCity)) return bad('invalid city');
      const buyMode = url.searchParams.get('buyMode') === 'order' ? 'order' : 'instant';
      const salesTaxPct = clamp(num(url.searchParams.get('salesTax'), 8), 0, 25);
      const setupFeePct = clamp(num(url.searchParams.get('setupFee'), 2.5), 0, 10);
      const rrr = clamp(num(url.searchParams.get('rrr'), 0.152), 0, 0.6);

      const ids = [...new Set([...recipe.resources.map((r) => r.id), itemId])];
      const prices = await fetchPrices(server, ids, { locations: [...MAIN_CITIES], qualities: [1] });
      const result = calcCraft({ itemId, recipe, prices, buyCity, sellCity, settings: { rrr, buyMode, salesTaxPct, setupFeePct } });
      if (!result.ok) return json({ server, item, recipe, result });
      const cheapest = cheapestCityFor(recipe, prices, buyMode);
      return json({ server, item, recipe, buyCity, sellCity, result, cheapest });
    }

    if (path === '/flip') {
      const itemId = url.searchParams.get('item') ?? '';
      if (!itemId) return bad('missing item');
      if (!isMarketItemId(itemId)) return bad('invalid item');
      const salesTaxPct = clamp(num(url.searchParams.get('salesTax'), 8), 0, 25);
      const setupFeePct = clamp(num(url.searchParams.get('setupFee'), 2.5), 0, 10);
      const prices = await fetchPrices(server, [itemId], { locations: [...MAIN_CITIES], qualities: [1] });
      const best = calcBestFlip({ prices, settings: { salesTaxPct, setupFeePct } });
      return json({ server, item: itemId, prices, best });
    }

    if (path === '/rank') {
      // Mass scan of the craftable universe. Chunk count is bounded by maxItems + chunkSize:
      // free Workers/Pages allow ~50 subrequests — maxItems 1200 @ chunk 200 = ~11 chunks, safe.
      const tierMin = clamp(num(url.searchParams.get('tierMin'), 4), 1, 8);
      const tierMax = clamp(num(url.searchParams.get('tierMax'), 6), tierMin, 8);
      const enchantParams = parseCommaList(url.searchParams.get('enchants'), 4, (value) => /^[0-3]$/.test(value));
      if (enchantParams === null) return bad('invalid enchants');
      const enchants = enchantParams.map(Number);
      const maxItems = clamp(num(url.searchParams.get('maxItems'), 1200), 1, 1500);
      const buyMode = url.searchParams.get('buyMode') === 'order' ? 'order' : 'instant';
      const sellCity = url.searchParams.get('sellCity') || 'Black Market';
      if (sellCity !== 'best' && !isMainCity(sellCity)) return bad('invalid sell city');
      const rrr = clamp(num(url.searchParams.get('rrr'), 0.152), 0, 0.6);
      const salesTaxPct = clamp(num(url.searchParams.get('salesTax'), 8), 0, 25);
      const setupFeePct = clamp(num(url.searchParams.get('setupFee'), 2.5), 0, 10);
      const topN = clamp(num(url.searchParams.get('topN'), 100), 1, 250);
      const result = await rankOpportunities({
        server, minTier: tierMin, maxTier: tierMax,
        enchants: enchants.length ? enchants : undefined,
        excludeCategories: ['furniture', 'vanity', 'farming'],
        maxItems, buyMode, sellCity, rrr, salesTaxPct, setupFeePct, topN,
      });
      return json(result);
    }

    if (path === '/history') {
      const itemId = url.searchParams.get('item') ?? '';
      if (!itemId) return bad('missing item');
      if (!isMarketItemId(itemId)) return bad('invalid item');
      const days = clamp(num(url.searchParams.get('days'), 14), 1, 30);
      const ts = num(url.searchParams.get('timeScale'), 24);
      const timeScale = (ts === 1 || ts === 6 ? ts : 24) as 1 | 6 | 24;
      const locations = parseLocations(url.searchParams.get('locations'));
      if (locations === null) return bad('invalid locations');
      const qualities = parseQualities(url.searchParams.get('qualities'));
      if (qualities === null) return bad('invalid qualities');
      const history = await fetchHistory(server, [itemId], { locations, qualities: qualities.length ? qualities : [1], timeScale, days });
      return json({ server, history });
    }

    return bad(`unknown endpoint ${path}`, 404);
  } catch (err) {
    // Detalhe só no log do servidor — a mensagem do erro cru pode expor
    // caminhos/internals (CodeQL js/stack-trace-exposure).
    console.error(`/api${path} falhou:`, err);
    return json({ error: 'upstream error' }, 502);
  }
};
