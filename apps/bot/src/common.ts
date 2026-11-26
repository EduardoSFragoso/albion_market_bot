import type { InteractionOption, ItemIndexEntry, MessageData } from './types.ts';

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

export const SALES_TAX_PCT = 8; // base (não premium)
export const SETUP_FEE_PCT = 2.5; // base (não premium)

// ---------- Formatação e utilidades dos comandos ----------

// ---------- Interações do Discord (tipos mínimos locais) ----------


// InteractionResponseType não existe como tipo global: números puros.
export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5, // reconhece já, edita depois via webhook
} as const;

export const COLOR_OK = 0x22c55e;
export const COLOR_BAD = 0xef4444;
export const COLOR_INFO = 0x5865f2;
export const D = (n: number, max = 0) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: max }).format(n);

export const iconUrl = (id: string, size: 16 | 64 | 128 = 64): string =>
  `https://render.albiononline.com/v1/item/${encodeURIComponent(id)}.png?size=${size}&quality=1`;

/** Enchant como sufixo ".n": T5_BAG@3 (ou nome com ench=3) → "… .3". */
export function withEnchSuffix(text: string, id: string): string {
  const m = /@(\d+)$/.exec(id);
  if (m) return `${text} .${m[1]}`;
  return text;
}

export function entryName(entry: ItemIndexEntry | undefined, id: string): string {
  if (!entry) return withEnchSuffix(id, id);
  const base = entry.pt || entry.en || entry.id;
  const ench = entry.ench > 0 ? ` .${entry.ench}` : '';
  return base + ench;
}

export function pick(opt: InteractionOption[] | undefined, name: string): string | undefined {
  const v = opt?.find((o) => o.name === name)?.value;
  return v == null ? undefined : String(v);
}

export function numOpt(options: InteractionOption[] | undefined, name: string): number | undefined {
  const value = pick(options, name);
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function reply(data: MessageData): Response {
  return new Response(
    JSON.stringify({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data }),
    { headers: { 'content-type': 'application/json' } },
  );
}
