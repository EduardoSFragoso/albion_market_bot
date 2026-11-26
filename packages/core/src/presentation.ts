/** Lightweight helpers safe to import in browser bundles. */
export function displayItemName(
  item: { en: string; pt: string; ench: number },
  locale: 'pt' | 'en' = 'en',
): string {
  const base = locale === 'pt' ? item.pt || item.en : item.en || item.pt;
  return item.ench > 0 ? `${base} .${item.ench}` : base;
}

/** Icon from Albion's official render service. */
export function iconUrl(id: string, size: 16 | 64 | 128 = 64): string {
  return `https://render.albiononline.com/v1/item/${encodeURIComponent(id)}.png?size=${size}&quality=1`;
}
