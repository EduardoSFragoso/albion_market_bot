const orderTypeLabels = {
  offer: 'type.offer',
  request: 'type.request',
};

const qualityLabels = {
  1: 'quality.normal',
  2: 'quality.good',
  3: 'quality.outstanding',
  4: 'quality.excellent',
  5: 'quality.masterpiece',
};

export function formatItemName(itemID, itemNames) {
  const localized = itemNames?.[itemID]?.trim();
  if (localized) return localized;

  return String(itemID ?? '').replaceAll('_', ' ').trim() || 'Item desconhecido';
}

export function formatOrderType(value, translate) {
  const raw = String(value ?? '').trim();
  const key = orderTypeLabels[raw.toLowerCase()];
  return key ? translate(key) : raw || translate('type.unknown');
}

export function formatQuality(value, translate) {
  const level = Number(value);
  const key = qualityLabels[level];
  if (key) return translate(key);
  return Number.isFinite(level) && level > 0
    ? translate('quality.level', { level })
    : translate('quality.unknown');
}

export function formatEnchantment(value, translate) {
  const level = Number(value);
  if (!Number.isInteger(level) || level < 0) return translate('enchant.unknown');
  return level === 0 ? translate('enchant.base') : `.${level}`;
}
