import assert from 'node:assert/strict';
import test from 'node:test';
import { fmt } from '../src/format.ts';

test('exibe prata arredondada ao inteiro com separador brasileiro', () => {
  assert.equal(fmt(1203.312), '1.203');
  assert.equal(fmt(295998), '295.998');
  assert.equal(fmt(-178796.688), '-178.797');
  assert.equal(fmt(0), '—');
});
