import itemsJson from './data/items.json';
import recipesJson from './data/recipes.json';
import type { ItemIndexEntry, Recipe, RecipeResource } from './types';
import { displayItemName } from './presentation';
export { iconUrl } from './presentation';

export const ITEMS = itemsJson as ItemIndexEntry[];
export const RECIPES = recipesJson as Record<string, Recipe>;

const byId = new Map<string, ItemIndexEntry>(ITEMS.map((i) => [i.id, i]));

export const getItem = (id: string): ItemIndexEntry | undefined => byId.get(id);
export const getRecipe = (id: string): Recipe | undefined => RECIPES[id];
export const hasRecipe = (id: string): boolean => !!RECIPES[id];

/** Return each valid material path as an independent recipe. */
export function recipeOptions(recipe: Recipe): Recipe[] {
  return [
    { resources: recipe.resources, amount: recipe.amount, silver: recipe.silver },
    ...(recipe.alternatives ?? []),
  ];
}

export interface RecipeTreeIngredient extends RecipeResource {
  en: string;
  pt: string;
  ench: number;
  components: RecipeTreeIngredient[];
}

/** Expands craftable ingredients into a bounded recipe tree for display. */
export function expandRecipeTree(itemId: string, maxDepth = 4, rootRecipe?: Recipe): RecipeTreeIngredient[] {
  let remainingNodes = 200;
  const depthLimit = Math.max(0, Math.min(5, Math.floor(maxDepth)));

  const expand = (id: string, count: number, depth: number, ancestors: Set<string>): RecipeTreeIngredient | null => {
    if (remainingNodes <= 0) return null;
    remainingNodes -= 1;
    const item = getItem(id);
    const recipe = getRecipe(id);
    const craftsNeeded = recipe ? Math.ceil(count / Math.max(1, recipe.amount)) : 0;
    const nextAncestors = new Set(ancestors).add(id);
    const components = depth < depthLimit
      ? (recipe?.resources ?? [])
        .filter((resource) => !nextAncestors.has(resource.id))
        .map((resource) => expand(resource.id, resource.count * craftsNeeded, depth + 1, nextAncestors))
        .filter((resource): resource is RecipeTreeIngredient => resource !== null)
      : [];

    return {
      id, count,
      en: item?.en ?? id,
      pt: item?.pt || item?.en || id,
      ench: item?.ench ?? 0,
      components,
    };
  };

  return ((rootRecipe ?? getRecipe(itemId))?.resources ?? [])
    .map((resource) => expand(resource.id, resource.count, 0, new Set([itemId])))
    .filter((resource): resource is RecipeTreeIngredient => resource !== null);
}

/** Localized display name with enchantment suffix (e.g. "Bolsa do Adepto .2"). */
export function displayName(id: string, locale: 'pt' | 'en' = 'en'): string {
  const item = getItem(id);
  if (!item) return id;
  return displayItemName(item, locale);
}

/** Icon from Albion's official render service. size: 1|3|8 (multiples of 64px). */
// O CDN de render (render.albiononline.com) só aceita hoje 16/64/128 — os tamanhos
// 1/3/8 da era antiga respondem HTTP 500 (verificado 2026-11).
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
