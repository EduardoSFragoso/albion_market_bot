import type { Env } from './types.ts';

// ---------- Validação de payloads HTTP assinados pelo Discord ----------
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;
const MAX_INTERACTION_BODY_BYTES = 64 * 1024;
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function verifyDiscordSignature(
  env: Env,
  request: Request,
  rawBody: string,
): Promise<boolean> {
  const sigHex = request.headers.get('x-signature-ed25519') ?? '';
  const timestamp = request.headers.get('x-signature-timestamp') ?? '';
  if (!env.DISCORD_PUBLIC_KEY || !/^[0-9a-fA-F]{128}$/.test(sigHex) || !/^\d+$/.test(timestamp)) {
    return false;
  }
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_SIGNATURE_AGE_MS) {
    return false;
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(env.DISCORD_PUBLIC_KEY),
    { name: 'Ed25519' },
    false,
    ['verify'],
  );
  const message = enc.encode(`${timestamp}${rawBody}`);
  return crypto.subtle.verify('Ed25519', key, hexToBytes(sigHex), message);
}

export async function readInteractionBody(request: Request): Promise<string | null> {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_INTERACTION_BODY_BYTES) return null;

  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_INTERACTION_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

// ---------- Handlers dos comandos ----------
