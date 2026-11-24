// Sanity tests of the core package — fictional prices, known results, no network.
// Failed assert = hard failure. Run: npx tsx packages/core/test/sanity.ts
import {
  searchItems, getItem, getRecipe, displayName,
  calcBestFlip, calcCraft, rankUniverse, scoreCraftItem,
} from '../src/index.ts';
import type { MarketPrice } from '../src/types.ts';

let failed = false;
function assert(cond: boolean, name: string, extra = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failed = true;
}
function eq(actual: number, expected: number, name: string, eps = 1e-6): void {
  assert(Math.abs(actual - expected) < eps, name, `got=${actual} want=${expected}`);
}

// ---- fixtures (fictional, quality 1, fresh dates) ----
const when = new Date(Date.now() - 3_600_000).toISOString().slice(0, 19);
const mk = (item: string, city: string, sell: number, buy: number, stale = false): MarketPrice => {
  const d = stale ? '0000' : when; // year 0000 = eternal stale sentinel (~7d old)
  return {
    item_id: item, city, quality: 1,
    sell_price_min: sell, sell_price_min_date: d, sell_price_max: sell,
    buy_price_min: buy, buy_price_min_date: d, buy_price_max: buy,
  };
};

// ---- search / items ----
const r1 = searchItems('bolsa adepto .1', { locale: 'pt', limit: 3 });
assert(r1[0]?.id === 'T4_BAG@1', 'search PT com hint de encantamento', r1.map((i) => i.id).join(','));

// ---- craft: setup fee now applied (8% + 2.5%) ----
// recipe T4_BAG@1: 8x T4_CLOTH_LEVEL1@1 + 8x T4_LEATHER_LEVEL1@1 + 192x T4_RUNE, amount 1
const gRecipe = getRecipe('T4_BAG@1')!;
if (!gRecipe) throw new Error('missing T4_BAG@1 recipe — regenere os dados');
const prices: MarketPrice[] = [
  mk('T4_CLOTH_LEVEL1@1', 'Bridgewatch', 400, 300),
  mk('T4_LEATHER_LEVEL1@1', 'Lymhurst', 420, 350),
  mk('T4_RUNE', 'Caerleon', 60, 55),
  mk('T4_BAG@1', 'Black Market', 0, 11000),
  mk('T4_BAG@1', 'Bridgewatch', 9500, 7900),
  mk('T4_BAG@1', 'Narnia', 999999, 1), // fake city, live price — must NOT leak into picks
];
const craft = calcCraft({
  itemId: 'T4_BAG@1', recipe: gRecipe, prices, buyCity: 'Bridgewatch', sellCity: 'Black Market',
  settings: { rrr: 0.152, buyMode: 'instant', salesTaxPct: 8, setupFeePct: 2.5 },
});
const matCost = (8 * 400 + 8 * 420 + 192 * 60) * (1 - 0.152); // instant buy = sell_price_min, RRR-adjusted
const revenue = 11000 * (1 - 0.08) * (1 - 0.025);
eq(craft.materialCost, matCost, 'craft materialCost (RRR)');
eq(craft.revenue, revenue, 'craft revenue aplica salesTax E setupFee (mudança: antes só salesTax)');
eq(craft.profit, revenue - matCost, 'craft profit');
eq(craft.profitPctOfCost, (revenue - matCost) / matCost, 'craft profitPctOfCost');
assert(craft.materials.every((m) => m.usedCity !== 'Narnia'), 'cidades fake ignoradas');
assert(craft.materials.find((m) => m.id === 'T4_RUNE')!.usedCity === 'Caerleon', 'rune comprada onde tem preço (fallback)');

// ---- flip: best route ----
const flip = calcBestFlip({ prices: [prices[3], prices[4], prices[5]], settings: { salesTaxPct: 4, setupFeePct: 0 } });
assert(flip !== null && flip.profitPerUnit > 0 && flip.sellCity === 'Narnia', 'flip acha a melhor cidade', JSON.stringify(flip));
const flipStale = calcBestFlip({ prices: [
  mk('T4_RUNE', 'Caerleon', 60, 55, true),
  mk('T4_RUNE', 'Martlock', 100, 60, true),
], settings: { salesTaxPct: 4, setupFeePct: 0 } });
assert(flipStale === null, 'flip ignora preços velhos (>7d)');

// ---- rank: universe ----
const uni = rankUniverse({ minTier: 4, maxTier: 4, enchants: [0], maxItems: 60 });
assert(uni.length === 60, 'universe respeita maxItems');
assert(uni.every((i) => i.tier === 4 && i.ench === 0 && i.craftable === 1), 'universe filtra tier/ench/craftable');
const uni2 = rankUniverse({ minTier: 4, maxTier: 4, enchants: [0], maxItems: 60, excludeCategories: ['weapons'] });
assert(uni2.length === 60 && uni2.every((i) => i.cat !== 'weapons'), 'universe exclui categoria');

// ---- rank: scoreCraftItem (pure, fictional) ----
const bag = getItem('T4_BAG@1')!;
const opt = { buyMode: 'instant' as const, sellCity: 'Black Market', rrr: 0.152, salesTaxPct: 8, setupFeePct: 2.5, requireComplete: true };
const entry = scoreCraftItem(bag, gRecipe, prices, opt);
assert(entry !== null, 'scoreCraftItem pontua T4_BAG@1');
if (entry) {
  eq(entry.materialCost, matCost, 'rank materialCost alinhado com calcCraft');
  eq(entry.netPrice, revenue, 'rank netPrice após 8%+2.5%');
  eq(entry.profit, revenue - matCost, 'rank profit');
  assert(entry.sellCity === 'Black Market' && entry.salePrice === 11000, 'sellCity Black Market com o lance de 11000');
  assert(entry.buyCity.includes('Bridgewatch') && entry.buyCity.includes('Caerleon'), 'buyCity resume as cidades');
}
const best = scoreCraftItem(bag, gRecipe, prices, { ...opt, sellCity: 'best' });
// instant sell = maior LANCE (buy_price_max) vivo; ofertas (sell_price_min) não são venda instantânea
assert(best !== null && best.sellCity === 'Black Market' && best.salePrice === 11000, 'rank sellCity=best pega o maior lance');
// parcial: sem preço da rune → requireComplete descarta (não vira lucro gratuito)
const partial = scoreCraftItem(bag, gRecipe, [prices[0], prices[1], prices[3]], opt);
assert(partial === null, 'requireComplete descarta item com ingrediente sem preço');
const partialOk = scoreCraftItem(bag, gRecipe, [prices[0], prices[1], prices[3]], { ...opt, requireComplete: false });
assert(partialOk !== null && partialOk.missing.includes('T4_RUNE'), 'sem requireComplete marca missing');
// nada precificado → null
assert(scoreCraftItem(bag, gRecipe, [prices[3]], opt) === null, 'item sem nenhum ingrediente precificado = null');

console.log(failed ? '\nSANITY FALHOU 💥' : '\nSanity OK ✅');
if (failed) process.exit(1);
