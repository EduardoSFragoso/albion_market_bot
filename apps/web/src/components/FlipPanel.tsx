import { useEffect, useState } from 'react';
import { calcBestFlip, iconUrl } from '@albion/core';
import type { MarketPrice } from '@albion/core';
import { api } from '../api';
import type { Locale } from '../i18n';
import { t } from '../i18n';
import { fmt } from './PriceTable';

interface Props { itemId: string; locale: Locale; premium: boolean }

interface Route { buyCity: string; sellCity: string; profit: number; pct: number }

export default function FlipPanel({ itemId, locale, premium }: Props) {
  const [prices, setPrices] = useState<MarketPrice[] | null>(null);
  const [err, setErr] = useState('');
  const tax = premium ? 4 : 8;
  const fee = premium ? 1.5 : 2.5;

  useEffect(() => {
    let alive = true;
    setPrices(null); setErr('');
    api.prices(itemId, 1)
      .then((d) => alive && setPrices(d.prices))
      .catch((e) => alive && setErr(String(e.message ?? e)));
    return () => { alive = false; };
  }, [itemId]);

  if (err) return <p className="py-6 text-center text-sm text-red-600">{t(locale, 'error')}: {err}</p>;
  if (!prices) return <p className="py-6 text-center text-sm text-zinc-500">{t(locale, 'loading')}</p>;

  const best = calcBestFlip({ prices, settings: { salesTaxPct: tax, setupFeePct: fee }, sellMode: 'order' });
  const live = prices.filter((p) => p.quality === 1 && (p.sell_price_min > 0 || p.buy_price_max > 0));

  // rank all city pairs
  const routes: Route[] = [];
  const byCity = new Map(live.map((p) => [p.city, p]));
  for (const [b, bp] of byCity) {
    for (const [s, sp] of byCity) {
      if (b === s) continue;
      const buy = bp.sell_price_min;
      const sell = sp.buy_price_max;
      if (!buy || !sell) continue;
      const net = sell * (1 - tax / 100) * (1 - fee / 100);
      routes.push({ buyCity: b, sellCity: s, profit: net - buy, pct: (net - buy) / buy });
    }
  }
  routes.sort((a, b) => b.profit - a.profit);
  const top = routes.slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <img src={iconUrl(itemId, 64)} alt="" className="h-12 w-12" />
        {best && best.profitPerUnit > 0 ? (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t(locale, 'bestFlip')}</div>
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {best.buyCity} → {best.sellCity}{' '}
              <span className="ml-2 rounded-md bg-emerald-100 px-2 py-0.5 text-sm font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                +{fmt(best.profitPerUnit)} {(best.profitPct * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {fmt(best.buyPrice)} → {fmt(best.netPrice)} {t(locale, 'netPrice')} ({t(locale, 'perUnit')})
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t(locale, 'noData')}</p>
        )}
      </div>

      {top.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                <th className="px-4 py-2.5">{t(locale, 'buyAt')}</th>
                <th className="px-4 py-2.5">{t(locale, 'sellAt')}</th>
                <th className="px-4 py-2.5 text-right">{t(locale, 'profit')}</th>
                <th className="px-4 py-2.5 text-right">{t(locale, 'profitPct')}</th>
              </tr>
            </thead>
            <tbody>
              {top.map((r, i) => (
                <tr key={`${r.buyCity}-${r.sellCity}`} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                  <td className="px-4 py-2.5 text-zinc-800 dark:text-zinc-200">{i + 1}. {r.buyCity}</td>
                  <td className="px-4 py-2.5 text-zinc-800 dark:text-zinc-200">{r.sellCity === 'Black Market' ? '🛒 Black Market' : r.sellCity}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${r.profit > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                    {r.profit > 0 ? '+' : ''}{fmt(r.profit)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                    {(r.pct * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
