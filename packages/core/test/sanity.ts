// Quick sanity test of the core package. Run: node --experimental-strip-types node test
import { searchItems, getItem, getRecipe, displayName, calcBestFlip } from '../src/index.ts';
import type { MarketPrice } from '../src/types.ts';

const r1 = searchItems('bolsa adepto', { locale: 'pt', limit: 5 });
console.log('search PT "bolsa adepto":', r1.map((i) => `${i.id} = ${i.pt}`));

console.log('T4_BAG@1 recipe:', JSON.stringify(getRecipe('T4_BAG@1')));

// fake prices for the engr compound test
const mk = (item, city, sell, buy, days_ago = 0): MarketPrice => ({
  item_id: item, city, quality: 1,
  sell_price_min: sell, sell_price_min_date: new Date(Date.now() - days_ago * 86400000 - 3600000).toISOString().slice(0, 19), sell_price_max: sell,
  buy_price_min: buy, buy_price_min_date: new Date(Date.now() - days_ago * 86400000 - 3600000).toISOString().slice(0, 19), buy_price_max: buy,
});

const prices: MarketPrice[] = [
  mk('T4_CLOTH_LEVEL1@1', 'Bridgewatch', 400, 300),
  mk('T4_LEATHER_LEVEL1@1', 'Lymhurst', 420, 350),
  mk('T4_RUNE', 'Caerleon', 60, 55),
  mk('T4_BAG@1', 'Caerleon', 0, 8000),
  mk('T4_BAG@1', 'Bridgewatch', 9500, 7900),
  mk('T4_BAG@1', 'Black Market', 0, 11000),
];

const flip = calcBestFlip({ prices, settings: { salesTaxPct: 4, setupFeePct: 0 } });
console.log('best flip:', JSON.stringify(flip));
console.log('names:', displayName('T4_BAG@1', 'pt'), '|', displayName('T4_BAG@1', 'en'));
