import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeLanguage, translate } from './i18n.js';

test('provides Portuguese and English labels with Portuguese as the fallback', () => {
  assert.equal(translate('pt-BR', 'nav.archive'), 'Dump local');
  assert.equal(translate('en', 'nav.archive'), 'Local dump');
  assert.equal(translate('en', 'archive.records', { count: 12 }), '12 matching records');
  assert.equal(normalizeLanguage('en'), 'en');
  assert.equal(normalizeLanguage('fr'), 'pt-BR');
});
