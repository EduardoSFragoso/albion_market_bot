// Builds the static item index + recipe DB used by the site and the bot.
// Sources (community game-data dumps, updated after every game patch):
//   - https://github.com/ao-data/ao-bin-dumps  ->  items.json (recipes + tiers + categories)
//                                                 formatted/items.json (localized names incl. PT-BR)
// Outputs:
//   src/data/items.json    compact searchable index ~ {id, en, pt, tier, ench, cat, craftable}
//   src/data/recipes.json  { itemId: { resources: [{id, count}], amount, silver } }
// Market id conventions (verified against the AODP API):
//   - Equipment enchant variants: `T4_BAG@1`..`@4` (synthesized from the item's `enchantments`).
//   - Enchanted resources (raw & refined): `T4_WOOD_LEVEL1@1`, `T4_CLOTH_LEVEL1@2`, ...
//     (dump ids like `T4_CLOTH_LEVEL1` become `_LEVELn@n`).
//   - Runes/Souls/Relics for enchant crafting come from `upgraderequirements`.
import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../src/data');
const cacheDir = path.resolve(here, '../../../.scratch');
mkdirSync(outDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

function download(url, dest) {
  if (existsSync(dest) && statSync(dest).size > 1000) {
    console.log(`[build-data] cached: ${dest}`);
    return;
  }
  console.log(`[build-data] downloading ${url}`);
  execFileSync('curl', ['-sL', '--max-time', '300', '-o', dest, url], { stdio: 'inherit' });
}

const readJson = (f) => JSON.parse(readFileSync(f, 'utf-8'));

const DUMP_BASE = 'https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master';
const fullDump = path.join(cacheDir, 'items_full.json');
const namesDump = path.join(cacheDir, 'items_names.json');

download(`${DUMP_BASE}/items.json`, fullDump);
download(`${DUMP_BASE}/formatted/items.json`, namesDump);

const dump = readJson(fullDump).items;
const namesArr = readJson(namesDump);

// ---------- helpers ----------
const tl = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
// dump resource id -> market id: `T4_CLOTH_LEVEL1` -> `T4_CLOTH_LEVEL1@1`
const mkMarketId = (dumpId) => {
  const m = dumpId?.match?.(/^(.*_LEVEL)(\d+)$/i);
  return m ? `${m[1]}${m[2]}@${m[2]}` : dumpId;
};
const isFaction = (id) => /FACTION|_TOKEN|_ROADS/i.test(id ?? '');

// ---------- 1. name map ----------
const names = new Map(); // id -> { en, pt }
for (const e of namesArr) {
  const id = e.UniqueName;
  if (!id) continue;
  names.set(id, {
    en: e.LocalizedNames?.['EN-US'] ?? '',
    pt: e.LocalizedNames?.['PT-BR'] ?? e.LocalizedNames?.['EN-US'] ?? '',
  });
}
const nameFor = (id) => {
  const direct = names.get(id);
  if (direct?.en) return direct;
  const stripped =
    names.get(id.replace(/@\d+$/, '')) ??
    names.get(id.replace(/_LEVEL\d+@\d+$/i, '')) ??
    names.get(id.replace(/_LEVEL\d+$/i, ''));
  return stripped ?? { en: '', pt: '' };
};

const GENERIC_BASE_NAMES = {
  WOOD: { en: 'Wood', pt: 'Madeira' }, PLANKS: { en: 'Planks', pt: 'Tábuas' },
  ROCK: { en: 'Rock', pt: 'Rocha' }, STONEBLOCK: { en: 'Stone Block', pt: 'Bloco de Pedra' },
  HIDE: { en: 'Hide', pt: 'Pele' }, LEATHER: { en: 'Leather', pt: 'Couro' },
  ORE: { en: 'Ore', pt: 'Minério' }, METALBAR: { en: 'Metal Bar', pt: 'Barra de Metal' },
  FIBER: { en: 'Fiber', pt: 'Fibra' }, CLOTH: { en: 'Cloth', pt: 'Tecido' },
  RUNE: { en: 'Rune', pt: 'Runa' }, SOUL: { en: 'Soul', pt: 'Alma' }, RELIC: { en: 'Relic', pt: 'Relíquia' },
};

// ---------- 2. item index + recipes ----------
const USER_TYPES = [
  'equipmentitem', 'weapon', 'consumableitem', 'simpleitem', 'mount',
  'furnitureitem', 'journalitem', 'labourercontract', 'mountskin',
  'consumablefrominventoryitem', 'trashitem', 'siegebanner', 'crystalleagueitem',
  'transformationweapon', 'farmableitem', 'killtrophy', 'rewardtoken', 'hideoutitem', 'trackingitem',
];

const items = [];
const recipes = {};
const seen = new Set();

const resourcesFrom = (cr) => {
  for (const entry of tl(cr)) {
    if (!entry || typeof entry !== 'object') continue;
    const res = tl(entry.craftresource).filter((r) => r && !isFaction(r['@uniquename']));
    if (res.length) return res;
  }
  return [];
};

const addRecipe = (id, res, xtraRes, amount, silver) => {
  const list = [];
  for (const r of [...res, ...xtraRes]) {
    if (!r['@uniquename']) continue;
    const rid = mkMarketId(r['@uniquename']);
    const cnt = Number(r['@count'] ?? 1) || 1;
    const prev = list.find((x) => x.id === rid);
    if (prev) prev.count += cnt;
    else list.push({ id: rid, count: cnt });
  }
  if (!list.length) return false;
  recipes[id] = { resources: list, amount: amount || 1, silver: silver || 0 };
  return true;
};

const pushItem = (id, tier, cat, craftable) => {
  if (!id || typeof id !== 'string' || isFaction(id)) return;
  if (seen.has(id)) {
    if (craftable && !recipes[id]) recipes[id] = { resources: [], amount: 1, silver: 0 };
    return;
  }
  seen.add(id);
  const m = id.match(/^T(\d+)/i);
  const t = tier ?? (m ? Number(m[1]) : 0);
  const end = id.match(/@(\d+)$/i);
  const ench = end ? Number(end[1]) : 0;
  const n = nameFor(id);
  if (!n.en && !n.pt) return;
  items.push({ id, en: n.en, pt: n.pt, tier: t, ench, cat: cat ?? '', craftable: craftable ? 1 : 0 });
};

for (const type of USER_TYPES) {
  for (const entry of tl(dump[type])) {
    let id = entry?.['@uniquename'];
    if (!id || typeof id !== 'string') continue;
    id = mkMarketId(id); // `T4_CLOTH_LEVEL1` -> `T4_CLOTH_LEVEL1@1` (market id)
    const tier = entry['@tier'] ? Number(entry['@tier']) : undefined;
    const cat = entry['@shopcategory'] ?? '';
    const res = resourcesFrom(entry.craftingrequirements);
    let craftable = false;
    if (res.length) {
      craftable = addRecipe(id, res, [], Number(entry.craftingrequirements?.['@amountproduced'] ?? 1), Number(entry.craftingrequirements?.['@silver'] ?? 0));
    }
    pushItem(id, tier, cat, craftable);

    // enchant variants (equipment/weapon): recipes reference enchanted resources + runes/souls/relics
    for (const enc of tl(entry.enchantments?.enchantment)) {
      const lvl = Number(enc?.['@enchantmentlevel']);
      if (!lvl) continue;
      const eid = `${id}@${lvl}`;
      const eres = resourcesFrom(enc.craftingrequirements);
      const upgrade = tl(enc.upgraderequirements?.upgraderesource);
      const eCraftable = eres.length
        ? addRecipe(eid, eres, upgrade, Number(enc.craftingrequirements?.['@amountproduced'] ?? 1), Number(enc.craftingrequirements?.['@silver'] ?? 0))
        : false;
      pushItem(eid, tier, cat, eCraftable);
    }
  }
}

// base (T) resources that might not have come through the dump iteration
const RAW = ['WOOD', 'ROCK', 'HIDE', 'ORE', 'FIBER'];
const REFINED = ['PLANKS', 'STONEBLOCK', 'LEATHER', 'METALBAR', 'CLOTH'];
for (const t of ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8']) {
  // plain
  for (const base of [...RAW, ...REFINED]) {
    const id = `${t}_${base}`;
    if (seen.has(id) || !GENERIC_BASE_NAMES[base]) continue;
    // only add if no localized name exists (dump normally covers these)
    const g = GENERIC_BASE_NAMES[base];
    if (!names.has(id)) {
      seen.add(id);
      items.push({ id, en: g.en, pt: g.pt, tier: Number(t[1]), ench: 0, cat: 'resource', craftable: 0 });
    } else if (!items.some((x) => x.id === id)) {
      // dump had no type entry (rare) but we do have a name
      const n = names.get(id);
      seen.add(id);
      items.push({ id, en: n.en, pt: n.pt, tier: Number(t[1]), ench: 0, cat: 'resource', craftable: 0 });
    }
  }
  // enchant variants of resources: T4_WOOD_LEVEL1@1 .. T8_FIBER_LEVEL4@4
  for (const group of [[...RAW, ...REFINED]]) {
    for (const base of group) {
      if (!GENERIC_BASE_NAMES[base]) continue;
      for (let e = 1; e <= 4; e++) {
        const id = `${t}_${base}_LEVEL${e}@${e}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const n = names.get(id);
        const g = GENERIC_BASE_NAMES[base];
        items.push({
          id,
          en: n?.en ?? `${g.en} .${e}`,
          pt: n?.pt ?? `${g.pt} .${e}`,
          tier: Number(t[1]),
          ench: e,
          cat: 'resource',
          craftable: 0, // refine recipes exist in the dump (T4_CLOTH_LEVEL1) when present
        });
      }
    }
  }
  // magical resources
  for (const base of ['RUNE', 'SOUL', 'RELIC']) {
    const id = `${t}_${base}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = names.get(id);
    const g = GENERIC_BASE_NAMES[base];
    items.push({ id, en: n?.en ?? g.en, pt: n?.pt ?? g.pt, tier: Number(t[1]), ench: 0, cat: 'magical', craftable: 1 });
  }
}

// any ingredient still missing gets a generic entry
for (const rec of Object.values(recipes)) {
  for (const r of rec.resources) {
    if (seen.has(r.id)) continue;
    const m = r.id.match(/^T(\d+)/i);
    seen.add(r.id);
    const base = r.id.replace(/@\d+$/, '').replace(/^T\d+_/i, '');
    const pretty = base.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    items.push({ id: r.id, en: pretty, pt: pretty, tier: m ? Number(m[1]) : 0, ench: 0, cat: 'other', craftable: 0 });
  }
}

items.sort((a, b) => a.id.localeCompare(b.id));

const validItemIds = new Set(items.map((i) => i.id));
const cleanRecipes = {};
for (const [id, r] of Object.entries(recipes)) {
  if (!validItemIds.has(id)) continue;
  // drop recipes whose ingredients were not resolved to any item (avoid dead entries)
  cleanRecipes[id] = r;
}

writeFileSync(path.join(outDir, 'items.json'), JSON.stringify(items));
writeFileSync(path.join(outDir, 'recipes.json'), JSON.stringify(cleanRecipes));
console.log(`[build-data] items: ${items.length}  recipes: ${Object.keys(cleanRecipes).length}`);
