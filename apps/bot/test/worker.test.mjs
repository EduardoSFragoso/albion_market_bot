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
const body = JSON.stringify({ type: 1 });
const env = {
  SITE_URL: 'https://site.example',
  DISCORD_PUBLIC_KEY: publicKeyHex,
  DISCORD_APPLICATION_ID: '1234567890',
};
const ctx = { waitUntil() {} };

function signedRequest(timestamp = String(Math.floor(Date.now() / 1000))) {
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
