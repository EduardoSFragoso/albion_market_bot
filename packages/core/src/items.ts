import itemsJson from './data/items.json';
import recipesJson from './data/recipes.json';
import type { ItemIndexEntry, Recipe } from './types';

export const ITEMS = itemsJson as ItemIndexEntry[];
export const RECIPES = recipesJson as Record<string, Recipe>;

const byId = new Map<string, ItemIndexEntry>(ITEMS.map((i) => [i.id, i]));

export const getItem = (id: string): ItemIndexEntry | undefined => byId.get(id);
export const getRecipe = (id: string): Recipe | undefined => RECIPES[id];
export const hasRecipe = (id: string): boolean => !!RECIPES[id];

/** Localized display name with enchantment suffix (e.g. "Bolsa do Adepto .2"). */
export function displayName(id: string, locale: 'pt' | 'en' = 'en'): string {
  const item = getItem(id);
  if (!item) return id;
  const base = locale === 'pt' ? item.pt || item.en : item.en || item.pt;
  return item.ench > 0 ? `${base} .${item.ench}` : base;
}

/** Icon from Albion's official render service. size: 1|3|8 (multiples of 64px). */
// O CDN de render (render.albiononline.com) só aceita hoje 16/64/128 — os tamanhos
// 1/3/8 da era antiga respondem HTTP 500 (verificado 2026-11).
export function iconUrl(id: string, size: 16 | 64 | 128 = 64): string {
  return `https://render.albiononline.com/v1/item/${encodeURIComponent(id)}.png?size=${size}&quality=1`;
}

// ---- search ----

const searchIndex = ITEMS.map((item) => ({
  item,
  lower: `${item.en} ${item.pt} ${item.id}`.toLowerCase(),
}));

export interface SearchOptions {
  locale?: 'pt' | 'en';
  limit?: number;
  craftableOnly?: boolean;
}

/** Pure client-side search across EN/PT names and raw ids. */
export function searchItems(query: string, opts: SearchOptions = {}): ItemIndexEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const limit = opts.limit ?? 12;
  const terms = q.split(/\s+/);
  // enchant hint: tokens like ".1" / "@2" (users often paste display names like "Bolsa do Adepto .1")
  let enchHint: number | null = null;
  const matchTerms = terms.filter((term) => {
    const m = term.match(/^[.@](\d)$/);
    if (m && enchHint === null) {
      enchHint = Number(m[1]);
      return false;
    }
    return true;
  });
  if (!matchTerms.length) return [];
  const scored: Array<{ item: ItemIndexEntry; score: number }> = [];

  for (const { item, lower } of searchIndex) {
    if (opts.craftableOnly && !item.craftable) continue;
    if (enchHint !== null && item.ench !== enchHint) continue;
    let score = -1;
    let ok = true;
    for (const term of matchTerms) {
      const pos = lower.indexOf(term);
      if (pos === -1) {
        ok = false;
        break;
      }
      // word-start matches rank higher; id prefix matches top the list
      const wordStart = pos === 0 || /\W/.test(lower[pos - 1] ?? ' ');
      const s = (pos === 0 ? 100 : wordStart ? 50 : 10) - Math.min(pos, 40);
      score = score === -1 ? s : Math.min(score, s);
    }
    if (ok && score >= 0) scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  return scored.slice(0, limit).map((s) => s.item);
}
