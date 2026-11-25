import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const apiUrl = process.env.CORE_API_UNDER_TEST
  ? pathToFileURL(process.env.CORE_API_UNDER_TEST).href
  : new URL('../src/api.ts', import.meta.url).href;
const { fetchPrices } = await import(apiUrl);

const response = { ok: true, async json() { return []; } };

test('deduplica chamadas concorrentes com a mesma chave', async (t) => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return response;
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const id = 'T4_CACHE_DEDUPE_AUDIT';
  await Promise.all([
    fetchPrices('west', [id]),
    fetchPrices('west', [id]),
  ]);
  assert.equal(calls, 1);
});

test('remove entradas antigas quando o cache atinge o limite', async (t) => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return response;
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const ids = Array.from({ length: 257 }, (_, i) => `T4_CACHE_LIMIT_AUDIT_${i}`);
  for (const id of ids) await fetchPrices('west', [id], { ttlMs: 600_000 });
  await fetchPrices('west', [ids[0]], { ttlMs: 600_000 });
  assert.equal(calls, 258);
});
