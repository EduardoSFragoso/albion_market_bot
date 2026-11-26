import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(frontendDir, '../../packages/core/src/data/items.json');
const outputDir = resolve(frontendDir, 'public');

let itemNames = { 'pt-BR': {}, en: {} };
try {
  const items = JSON.parse(await readFile(sourcePath, 'utf8'));
  if (!Array.isArray(items)) throw new TypeError('item data must be an array');

  itemNames = {
    'pt-BR': Object.fromEntries(
      items
        .filter((item) => typeof item.id === 'string' && typeof item.pt === 'string' && item.pt.trim())
        .map((item) => [item.id, item.pt.trim()]),
    ),
    en: Object.fromEntries(
      items
        .filter((item) => typeof item.id === 'string' && typeof item.en === 'string' && item.en.trim())
        .map((item) => [item.id, item.en.trim()]),
    ),
  };
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.warn('Item names unavailable; the archive will show readable item IDs.');
}

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDir, 'item-name-index.pt.json'), JSON.stringify(itemNames['pt-BR'])),
  writeFile(resolve(outputDir, 'item-name-index.en.json'), JSON.stringify(itemNames.en)),
]);
console.log(
  `Prepared ${Object.keys(itemNames['pt-BR']).length} PT-BR and ${Object.keys(itemNames.en).length} English item names as static assets.`,
);
