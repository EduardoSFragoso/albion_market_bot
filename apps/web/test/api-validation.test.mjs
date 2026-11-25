import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const validationUrl = process.env.API_VALIDATION_UNDER_TEST
  ? pathToFileURL(process.env.API_VALIDATION_UNDER_TEST).href
  : new URL('../api-validation.ts', import.meta.url).href;
const { MAX_PRICE_ITEMS, MAX_SEARCH_QUERY_LENGTH, isMarketItemId, isSearchQueryValid, parseCommaList, parseQualities } = await import(validationUrl);

test('limita listas e remove duplicatas sem alterar a ordem', () => {
  assert.deepEqual(parseCommaList('T4_BAG,T4_BAG,T5_BAG', 3), ['T4_BAG', 'T5_BAG']);
  assert.equal(parseCommaList(Array.from({ length: MAX_PRICE_ITEMS + 1 }, (_, i) => `T4_ITEM_${i}`).join(','), MAX_PRICE_ITEMS), null);
});

test('aceita somente IDs do formato de mercado', () => {
  assert.equal(isMarketItemId('T4_CLOTH_LEVEL1@1'), true);
  assert.equal(isMarketItemId('T4_BAG@3'), true);
  assert.equal(isMarketItemId('T4_BAG/../../other'), false);
  assert.equal(isMarketItemId('X'.repeat(101)), false);
});

test('qualidades ficam no intervalo do jogo', () => {
  assert.deepEqual(parseQualities('1,3,5'), [1, 3, 5]);
  assert.equal(parseQualities('0,6'), null);
});

test('o limite de busca fica curto e explícito', () => {
  assert.equal(MAX_SEARCH_QUERY_LENGTH, 100);
  assert.equal(isSearchQueryValid('x'.repeat(100)), true);
  assert.equal(isSearchQueryValid('x'.repeat(101)), false);
});
