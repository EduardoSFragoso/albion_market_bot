import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const workerUrl = process.env.WORKER_UNDER_TEST
  ? pathToFileURL(process.env.WORKER_UNDER_TEST).href
  : new URL('../src/worker.ts', import.meta.url).href;
const { default: worker } = await import(workerUrl);

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicKeyHex = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
const env = {
  SITE_URL: 'https://site.example',
  DISCORD_PUBLIC_KEY: publicKeyHex,
  DISCORD_APPLICATION_ID: '1234567890',
};
const ctx = { waitUntil() {} };

function signedRequest(timestamp = String(Math.floor(Date.now() / 1000)), interaction = { type: 1 }) {
  const body = JSON.stringify(interaction);
  const signature = sign(null, Buffer.from(`${timestamp}${body}`), privateKey).toString('hex');
  return new Request('https://bot.example/interactions', {
    method: 'POST',
    headers: {
      'x-signature-ed25519': signature,
      'x-signature-timestamp': timestamp,
    },
    body,
  });
}

test('Discord assina o PING e recebe PONG', async () => {
  const response = await worker.fetch(signedRequest(), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { type: 1 });
});

test('GET mantém healthcheck e método diferente de POST é rejeitado', async () => {
  const health = await worker.fetch(new Request('https://bot.example/'), env, ctx);
  const rejected = await worker.fetch(new Request('https://bot.example/', { method: 'PUT' }), env, ctx);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'albion-market-bot online');
  assert.equal(rejected.status, 405);
});

test('comando desconhecido responde no formato de mensagem do Discord sem chamar APIs', async (t) => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('{}'); };
  t.after(() => { globalThis.fetch = previousFetch; });

  const response = await worker.fetch(signedRequest(undefined, {
    type: 2,
    data: { id: 'command-1', name: 'desconhecido' },
  }), env, ctx);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    type: 4,
    data: { content: '❓ Comando desconhecido: `/desconhecido`.' },
  });
  assert.equal(calls, 0);
});

test('preco responde sincronamente com resumo por cidade e melhor rota', async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.endsWith('/api/search')) {
      return Response.json({ results: [{ id: 'T4_BAG', en: 'Bag', pt: 'Bolsa', tier: 4, ench: 0, cat: 'bag', craftable: 1 }] });
    }
    if (url.pathname.endsWith('/api/prices')) {
      return Response.json({ prices: [
        { item_id: 'T4_BAG', city: 'Thetford', quality: 1, sell_price_min: 100, buy_price_max: 70 },
        { item_id: 'T4_BAG', city: 'Fort Sterling', quality: 1, sell_price_min: 120, buy_price_max: 90 },
      ] });
    }
    if (url.pathname.endsWith('/api/flip')) {
      return Response.json({ best: { buyCity: 'Thetford', sellCity: 'Fort Sterling', profitPerUnit: 10, profitPct: 0.1 } });
    }
    throw new Error('unexpected API request');
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const response = await worker.fetch(signedRequest(undefined, {
    type: 2,
    data: {
      id: 'command-preco', name: 'preco',
      options: [{ name: 'item', value: 'Bolsa', type: 3 }],
    },
  }), env, ctx);
  const message = await response.json();

  assert.equal(response.status, 200);
  assert.equal(message.type, 4);
  assert.deepEqual(calls.map((url) => url.pathname.split('/').at(-1)), ['search', 'prices', 'flip']);
  assert.equal(message.data.embeds[0].title, 'T4_BAG — preços');
  assert.match(message.data.embeds[0].fields[0].value, /Thetford/);
  assert.match(message.data.embeds[0].fields[0].value, /Fort Sterling/);
  assert.equal(message.data.embeds[0].fields.at(-1).name, '🚚 Melhor rota');
});

test('craft mostra materiais, custo, receita e lucro líquido', async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.endsWith('/api/craft')) {
      return Response.json({
        recipe: { resources: [{ id: 'T4_CLOTH', count: 2 }], amount: 1 },
        result: {
          ok: true, outputId: 'T4_BAG', amountPerCraft: 1,
          materials: [{ id: 'T4_CLOTH', countPerCraft: 2, effectiveCount: 1.7, unitPrice: 100, cost: 170, missingPrice: false }],
          materialCost: 170, totalCost: 170, salePrice: 500, revenue: 450,
          profit: 280, profitPctOfCost: 280 / 170, missingCities: [],
        },
        cheapest: { id: 'T4_CLOTH', city: 'Bridgewatch', unitPrice: 100 },
      });
    }
    if (url.pathname.endsWith('/api/search')) {
      return Response.json({ results: [{ id: 'T4_CLOTH', en: 'Cloth', pt: 'Tecido', tier: 4, ench: 0, cat: 'material', craftable: 0 }] });
    }
    throw new Error('unexpected API request');
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const response = await worker.fetch(signedRequest(undefined, {
    type: 2,
    data: {
      id: 'command-craft', name: 'craft',
      options: [
        { name: 'item', value: 'T4_BAG', type: 3 },
        { name: 'cidade_compra', value: 'Bridgewatch', type: 3 },
        { name: 'cidade_venda', value: 'Black Market', type: 3 },
        { name: 'rrr', value: 0.15, type: 10 },
      ],
    },
  }), env, ctx);
  const message = await response.json();

  assert.equal(message.type, 4);
  assert.equal(message.data.embeds[0].title, 'T4_BAG — fabricação');
  assert.equal(message.data.embeds[0].fields[0].name, '🧱 Materiais');
  assert.match(message.data.embeds[0].fields[0].value, /Tecido ×2/);
  assert.equal(message.data.embeds[0].fields[2].name, 'Receita (Black Market)');
  assert.match(message.data.embeds[0].fields[3].value, /280/);
  assert.deepEqual(calls.map((url) => url.pathname.split('/').at(-1)), ['craft', 'search']);
  assert.equal(calls[0].searchParams.get('buyCity'), 'Bridgewatch');
  assert.equal(calls[0].searchParams.get('rrr'), '0.15');
});

test('lucro monta as rotas entre cidades com impostos base', async (t) => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/api/flip');
    return Response.json({ prices: [
      { item_id: 'T4_BAG', city: 'Thetford', quality: 1, sell_price_min: 100, buy_price_max: 70 },
      { item_id: 'T4_BAG', city: 'Fort Sterling', quality: 1, sell_price_min: 200, buy_price_max: 180 },
    ], best: null });
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const response = await worker.fetch(signedRequest(undefined, {
    type: 2,
    data: { id: 'command-lucro', name: 'lucro', options: [{ name: 'item', value: 'T4_BAG', type: 3 }] },
  }), env, ctx);
  const message = await response.json();

  assert.equal(message.type, 4);
  assert.equal(message.data.embeds[0].title, 'T4_BAG — top rotas de lucro');
  assert.match(message.data.embeds[0].fields[0].value, /Thetford.*Fort Sterling/);
  assert.match(message.data.embeds[0].fields[1].value, /Thetford.*Fort Sterling/);
  assert.match(message.data.embeds[0].footer.text, /8%.*2\.5%/);
});

test('encantamento compara preço pronto e craft com o preset padrão de RRR', async (t) => {
  const previousFetch = globalThis.fetch;
  let requestUrl;
  globalThis.fetch = async (input) => {
    requestUrl = new URL(String(input));
    return Response.json({
      server: 'west', baseId: 'T4_BAG',
      rows: [{
        ench: 0, outputId: 'T4_BAG', en: 'Bag', pt: 'Bolsa', hasRecipe: true,
        buyPrice: 1000, buyCity: 'Bridgewatch', craftCost: 1200, craftCities: 'Caerleon',
        missing: [], cheaper: 'buy', savings: 200, savingsPct: 0.2,
      }],
    });
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  const response = await worker.fetch(signedRequest(undefined, {
    type: 2,
    data: { id: 'command-enchant', name: 'encantamento', options: [{ name: 'item', value: 'T4_BAG', type: 3 }] },
  }), env, ctx);
  const message = await response.json();

  assert.equal(message.type, 4);
  assert.equal(message.data.embeds[0].title, 'T4_BAG — comprar pronto vs. craftar');
  assert.match(message.data.embeds[0].fields[0].value, /comprar pronto: 1\.000/);
  assert.match(message.data.embeds[0].fields[0].value, /craftar: 1\.200/);
  assert.match(message.data.embeds[0].fields[0].value, /comprar pronto.*20% mais barato/);
  assert.equal(requestUrl.pathname, '/api/enchant');
  assert.equal(requestUrl.searchParams.get('rrr'), '0.152');
});

test('oportunidades responde deferred e edita a resposta original pelo webhook', async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith('https://site.example/api/rank?')) {
      return Response.json({ universeSize: 0, entries: [] });
    }
    return new Response(null, { status: 204 });
  };
  t.after(() => { globalThis.fetch = previousFetch; });

  let deferredWork;
  const interaction = {
    type: 2,
    application_id: '1234567890',
    token: 'one-time-interaction-token',
    data: { id: 'command-2', name: 'oportunidades', options: [] },
  };
  const response = await worker.fetch(signedRequest(undefined, interaction), env, {
    waitUntil(promise) { deferredWork = promise; },
  });

  assert.deepEqual(await response.json(), { type: 5 });
  await deferredWork;
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.startsWith('https://site.example/api/rank?'), true);
  assert.equal(calls[1].url, 'https://discord.com/api/v10/webhooks/1234567890/one-time-interaction-token/messages/@original');
  assert.equal(calls[1].init.method, 'PATCH');
  assert.match(calls[1].init.body, /Nenhuma oportunidade encontrada/);
});

test('assinatura Ed25519 inválida recebe 401', async () => {
  const request = signedRequest();
  const headers = new Headers(request.headers);
  headers.set('x-signature-ed25519', '0'.repeat(128));
  const invalidRequest = new Request(request, { headers });
  const response = await worker.fetch(invalidRequest, env, ctx);
  assert.equal(response.status, 401);
});

test('assinatura válida fora da janela de tempo recebe 401', async () => {
  const timestamps = ['0', String(Math.floor(Date.now() / 1000) + 301)];
  for (const timestamp of timestamps) {
    const response = await worker.fetch(signedRequest(timestamp), env, ctx);
    assert.equal(response.status, 401);
  }
});

test('rejeita corpo acima do limite antes de verificar assinatura', async () => {
  const request = new Request('https://bot.example/interactions', {
    method: 'POST',
    headers: {
      'x-signature-ed25519': '0'.repeat(128),
      'x-signature-timestamp': String(Math.floor(Date.now() / 1000)),
    },
    body: 'x'.repeat(64 * 1024 + 1),
  });

  const response = await worker.fetch(request, env, ctx);
  assert.equal(response.status, 413);
});
