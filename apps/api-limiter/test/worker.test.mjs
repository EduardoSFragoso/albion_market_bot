import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const workerUrl = process.env.LIMITER_WORKER_UNDER_TEST
  ? pathToFileURL(process.env.LIMITER_WORKER_UNDER_TEST).href
  : new URL('../src/worker.ts', import.meta.url).href;
const { default: worker } = await import(workerUrl);

function makeRequest({ ip = '203.0.113.8', routeClass = 'standard', method = 'POST' } = {}) {
  return new Request('https://limiter.internal/check', {
    method,
    headers: {
      'x-albion-client-ip': ip,
      'x-albion-route-class': routeClass,
    },
  });
}

test('limita por IP e cobra dez unidades pelo rank', async () => {
  const calls = [];
  let used = 50;
  const env = {
    API_RATE_LIMITER: {
      async limit(options) {
        calls.push(options);
        const success = used < 60;
        if (success) used += options.delta;
        return { success };
      },
    },
  };

  const allowed = await worker.fetch(makeRequest({ routeClass: 'rank' }), env);
  const denied = await worker.fetch(makeRequest({ routeClass: 'rank' }), env);

  assert.equal(allowed.status, 204);
  assert.equal(denied.status, 429);
  assert.deepEqual(calls, [
    { key: '203.0.113.8', delta: 10 },
    { key: '203.0.113.8', delta: 10 },
  ]);
});

test('rejeita chamadas fora do contrato interno sem consultar o limite', async () => {
  let calls = 0;
  const env = { API_RATE_LIMITER: { async limit() { calls++; return { success: true }; } } };

  assert.equal((await worker.fetch(makeRequest({ method: 'GET' }), env)).status, 405);
  assert.equal((await worker.fetch(makeRequest({ ip: 'spoofed-ip' }), env)).status, 400);
  assert.equal((await worker.fetch(makeRequest({ routeClass: 'other' }), env)).status, 400);
  assert.equal(calls, 0);
});
