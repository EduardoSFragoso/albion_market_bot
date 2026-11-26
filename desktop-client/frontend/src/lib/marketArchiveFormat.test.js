import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatEnchantment,
  formatItemName,
  formatOrderType,
  formatQuality,
} from './marketArchiveFormat.js';
import { translate } from './i18n.js';

test('shows the localized item name while retaining a readable fallback', () => {
  assert.equal(formatItemName('T4_BAG', { T4_BAG: 'Bolsa do Adepto' }), 'Bolsa do Adepto');
  assert.equal(formatItemName('T4_BAG', { T4_BAG: "Adept's Bag" }), "Adept's Bag");
  assert.equal(formatItemName('T4_BAG@1', {}), 'T4 BAG@1');
});

test('translates market order types, quality, and enchantment labels', () => {
  const pt = (key, values) => translate('pt-BR', key, values);
  assert.equal(formatOrderType('offer', pt), 'Venda');
  assert.equal(formatOrderType('request', pt), 'Compra');
  assert.equal(formatQuality(1, pt), 'Normal');
  assert.equal(formatQuality(5, pt), 'Obra-prima');
  assert.equal(formatEnchantment(0, pt), 'Base');
  assert.equal(formatEnchantment(2, pt), '.2');

  const en = (key, values) => translate('en', key, values);
  assert.equal(formatOrderType('offer', en), 'Sell order');
  assert.equal(formatQuality(5, en), 'Masterpiece');
  assert.equal(formatEnchantment(0, en), 'Base');
});
