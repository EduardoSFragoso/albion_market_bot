import type { MarketPrice } from '@albion/core';
import type { Locale } from '../i18n';
import { t } from '../i18n';
import { fmt } from '../format';
export { fmt } from '../format';

function age(dateStr: string): string {
  if (!dateStr || dateStr.startsWith('0001-01-01')) return '—';
  const ms = Date.now() - (Date.parse(dateStr + ('Z'.includes('T') === false ? 'Z' : '')) || Date.parse(dateStr));
  const h = Math.floor(ms / 3_600_000);
  if (Number.isNaN(h)) return '—';
  if (h < 1) return '<1h';
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

interface Props {
  prices: MarketPrice[];
  locale: Locale;
}

/** City rows with instant-buy / instant-sell / spread. */
export default function PriceTable({ prices, locale }: Props) {
  const rows = prices.filter((p) => p.quality === 1);
  if (!rows.length) return <p className="py-6 text-center text-sm text-zinc-500">{t(locale, 'noData')}</p>;

  const bestSell = Math.max(0, ...rows.map((r) => r.buy_price_max || 0)); // insta-sell target
  const bestBuy = Math.min(...rows.map((r) => (r.sell_price_min > 0 ? r.sell_price_min : Infinity)));

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[700px] table-fixed text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
            <th className="w-[28%] px-4 py-2.5">{t(locale, 'city')}</th>
            <th className="w-[24%] px-4 py-2.5 text-right">{t(locale, 'sellInstant')} 💸</th>
            <th className="w-[24%] px-4 py-2.5 text-right">{t(locale, 'buyOrder')} 📈</th>
            <th className="w-[24%] px-4 py-2.5 text-right">{t(locale, 'lastUpdated')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={`${p.city}-${p.quality}`} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
              <td className="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-800 dark:text-zinc-200">
                {p.city === 'Black Market' ? '🛒 ' : ''}{p.city}
              </td>
              <td className={`whitespace-nowrap px-4 py-2.5 text-right tabular-nums ${p.sell_price_min === bestBuy && p.sell_price_min > 0 ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                {fmt(p.sell_price_min)}
              </td>
              <td className={`whitespace-nowrap px-4 py-2.5 text-right tabular-nums ${p.buy_price_max === bestSell && p.buy_price_max > 0 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                {fmt(p.buy_price_max)}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-zinc-500 dark:text-zinc-500">
                {age(p.sell_price_min > 0 ? p.sell_price_min_date : p.buy_price_max_date)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
