import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const routePath = process.env.API_ROUTE_UNDER_TEST
  ? process.env.API_ROUTE_UNDER_TEST
  : fileURLToPath(new URL('../functions/api/[[route]].ts', import.meta.url));
const validationUrl = new URL('../api-validation.ts', import.meta.url).href;
const coreStub = `
export const MAIN_CITIES = ['Thetford', 'Fort Sterling', 'Lymhurst', 'Bridgewatch', 'Martlock', 'Caerleon', 'Brecilien', 'Black Market'];
export async function fetchPrices() { globalThis.__aodpCalls++; return []; }
export async function fetchHistory() { globalThis.__aodpCalls++; return []; }
export function searchItems() { return []; }
export function getItem(id) { return id === 'T4_BAG' ? { id, en: 'Bag', pt: 'Bolsa', tier: 4, ench: 0, cat: 'bag', craftable: 1 } : undefined; }
export function getRecipe(id) { return id === 'T4_BAG' ? { resources: [{ id: 'T4_CLOTH', count: 1 }], amount: 1, silver: 0 } : undefined; }
export function calcCraft() { return { ok: true, profit: 1 }; }
export function calcBestFlip() { return undefined; }
export function cheapestCityFor() { return undefined; }
export async function rankOpportunities() { return {}; }
export function compareEnchants() { return []; }
export function enchantFamilyIds() { return []; }
`;
const coreUrl = `data:text/javascript;base64,${Buffer.from(coreStub).toString('base64')}`;
const routeSource = (await readFile(routePath, 'utf8'))
  .replace("from '@albion/core';", `from '${coreUrl}';`)
  .replace("from '../../api-validation';", `from '${validationUrl}';`);
const compiledRoute = ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const routeUrl = `data:text/javascript;base64,${Buffer.from(compiledRoute).toString('base64')}`;
globalThis.__aodpCalls = 0;
const { onRequest } = await import(routeUrl);

function context(path, limiterFetch, headers = {}) {
  return {
    request: new Request(`https://site.example${path}`, { headers }),
    env: {
      AODP_SERVER: 'west',
      API_LIMITER: { fetch: limiterFetch },
    },
  };
}

test('bloqueia antes do AODP e não deixa a resposta 429 entrar em cache', async () => {
  let limiterCalls = 0;
  globalThis.__aodpCalls = 0;

  const response = await onRequest(context(
    '/api/prices?items=T7_RATE_LIMIT_TEST',
    async () => {
      limiterCalls++;
      return new Response(null, { status: 429 });
    },
    {
      'CF-Connecting-IP': '203.0.113.8',
      'X-Forwarded-For': '198.51.100.22',
    },
  ));

  assert.equal(response.status, 429);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(limiterCalls, 1);
  assert.equal(globalThis.__aodpCalls, 0);
});

test('passa ao limitador o IP da Cloudflare e ignora X-Forwarded-For', async () => {
  let limiterRequest;
  const response = await onRequest(context(
    '/api/search?q=bag',
    async (input, init) => {
      limiterRequest = new Request(input, init);
      return new Response(null, { status: 204 });
    },
    {
      'CF-Connecting-IP': '203.0.113.8',
      'X-Forwarded-For': '198.51.100.22',
    },
  ));

  assert.equal(limiterRequest.headers.get('x-albion-client-ip'), '203.0.113.8');
  assert.equal(limiterRequest.headers.get('x-albion-route-class'), 'standard');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, s-maxage=60, stale-while-revalidate=300');
});

test('atribui classe pesada ao rank', async () => {
  let limiterRequest;
  await onRequest(context('/api/rank?maxItems=1', async (input, init) => {
    limiterRequest = new Request(input, init);
    return new Response(null, { status: 204 });
  }, { 'CF-Connecting-IP': '203.0.113.8' }));

  assert.equal(limiterRequest.headers.get('x-albion-route-class'), 'rank');
});

test('falha fechada sem IP confiável ou se o limitador estiver indisponível', async () => {
  let limiterCalls = 0;
  const missingIp = await onRequest(context('/api/search?q=bag', async () => {
    limiterCalls++;
    return new Response(null, { status: 204 });
  }));
  const unavailable = await onRequest(context('/api/search?q=bag', async () => {
    throw new Error('internal service unavailable');
  }, { 'CF-Connecting-IP': '203.0.113.8' }));

  assert.equal(missingIp.status, 503);
  assert.equal(missingIp.headers.get('cache-control'), 'no-store');
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('cache-control'), 'no-store');
  assert.equal(limiterCalls, 0);
});

test('rejeita cidades desconhecidas em craft e rank', async () => {
  const headers = { 'CF-Connecting-IP': '203.0.113.8' };
  const allow = async () => new Response(null, { status: 204 });
  const invalidBuyCity = await onRequest(context('/api/craft?item=T4_BAG&buyCity=Unknown', allow, headers));
  const invalidSellCity = await onRequest(context('/api/craft?item=T4_BAG&sellCity=Unknown', allow, headers));
  const invalidRankCity = await onRequest(context('/api/rank?sellCity=Unknown', allow, headers));

  assert.equal(invalidBuyCity.status, 400);
  assert.equal(invalidSellCity.status, 400);
  assert.equal(invalidRankCity.status, 400);
});
