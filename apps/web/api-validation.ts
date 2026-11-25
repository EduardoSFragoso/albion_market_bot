export const MAX_SEARCH_QUERY_LENGTH = 100;
export const MAX_PRICE_ITEMS = 200;
export const MAX_LOCATIONS = 8;

export function parseCommaList(
  value: string | null,
  maxEntries: number,
  isValid: (entry: string) => boolean = () => true,
): string[] | null {
  if (value === null || value.trim() === '') return [];
  const entries = value.split(',');
  if (entries.length > maxEntries) return null;

  const normalized = entries.map((entry) => entry.trim()).filter(Boolean);
  if (normalized.some((entry) => !isValid(entry))) return null;
  return [...new Set(normalized)];
}

export function isMarketItemId(value: string): boolean {
  return value.length <= 100 && /^[A-Za-z0-9_]+(?:@\d+)?$/.test(value);
}

export function isSearchQueryValid(value: string): boolean {
  return value.length <= MAX_SEARCH_QUERY_LENGTH;
}

export function parseQualities(value: string | null): number[] | null {
  const entries = parseCommaList(value, 5, (entry) => /^[1-5]$/.test(entry));
  return entries === null ? null : entries.map(Number);
}
