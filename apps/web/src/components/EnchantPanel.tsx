import { useEffect, useState } from 'react';
import { iconUrl } from '@albion/core';
import type { EnchantRow } from '@albion/core';
import { api } from '../api';
import type { Locale } from '../i18n';
import { t } from '../i18n';
import { fmt } from './PriceTable';

interface Props { itemId: string; locale: Locale }
// premium não entra: a comparação é só de custo (comprar pronto vs. craftar) — não há venda.

export default function EnchantPanel({ itemId, locale }: Props) {
  const [rrr, setRrr] = useState(0.152);
  const [buyMode, setBuyMode] = useState<'instant' | 'order'>('instant');
  const [rows, setRows] = useState<EnchantRow[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setRows(null); setErr('');
    api.enchant({ item: itemId, rrr, buyMode })
      .then((d) => alive && setRows(d.rows))
      .catch((e) => alive && setErr(String(e.message ?? e)));
    return () => { alive = false; };
  }, [itemId, rrr, buyMode]);

  const selCls = 'rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200';

  if (err) return <p className="py-6 text-center text-sm text-red-600">{t(locale, 'error')}: {err}</p>;
  if (!rows) return <p className="py-6 text-center text-sm text-zinc-500">{t(locale, 'loading')}</p>;
  if (!rows.some((r) => r.buyPrice !== null || r.craftCost !== null)) {
    return <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{t(locale, 'enchantNoData')}</p>;
  }

  const verdict = (r: EnchantRow) => {
    if (r.cheaper === 'buy') return <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">🛒 {t(locale, 'enchantChBuy')}</span>;
    if (r.cheaper === 'craft') return <span className="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700 dark:bg-sky-900/40 dark:text-sky-400">⚒ {t(locale, 'enchantChCraft')}</span>;
    if (r.buyPrice !== null && r.craftCost !== null) return <span className="text-xs text-zinc-500">{t(locale, 'enchantTie')}</span>;
    return <span className="text-xs text-zinc-400">—</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
        <span className="font-medium text-zinc-500 dark:text-zinc-400">{t(locale, 'returnRate')}</span>
        <select className={selCls} value={String(rrr)} onChange={(e) => setRrr(Number(e.target.value))}>
          <option value="0.152">{t(locale, 'rrrBase')}</option>
          <option value="0.248">{t(locale, 'rrrBonus')}</option>
          <option value="0.435">{t(locale, 'rrrCaerleon')}</option>
        </select>
        <span className="ml-2 font-medium text-zinc-500 dark:text-zinc-400">{t(locale, 'buyMode')}</span>
        <select className={selCls} value={buyMode} onChange={(e) => setBuyMode(e.target.value as 'instant' | 'order')}>
          <option value="instant">{t(locale, 'instantBuy')}</option>
          <option value="order">{t(locale, 'buyOrders')}</option>
        </select>
        <span className="ml-auto text-zinc-400">{t(locale, 'perUnit')}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
              <th className="px-3 py-2.5">{t(locale, 'item')}</th>              <th className="px-3 py-2.5 text-right">{t(locale, 'enchantBuyReady')}</th>
              <th className="px-3 py-2.5 text-right">{t(locale, 'enchantCraftIt')}</th>
              <th className="px-3 py-2.5 text-right">{t(locale, 'enchantVerdict')}</th>
              <th className="px-3 py-2.5 text-right">{t(locale, 'cheapestIn')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.outputId} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <img src={iconUrl(r.outputId, 1)} alt="" className="h-8 w-8 shrink-0" />
                    <div>
                      <div className="font-medium text-zinc-800 dark:text-zinc-200">.{r.ench}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">{r.pt || r.en}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-200">
                  {r.buyPrice !== null ? fmt(r.buyPrice) : <span className="text-zinc-400">—</span>}
                  {r.buyPrice !== null && <div className="text-xs text-zinc-400">{r.buyCity}</div>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-200">
                  {r.craftCost !== null
                    ? fmt(r.craftCost)
                    : (
                      <span className="text-zinc-400" title={r.missing.join(', ') || undefined}>
                        {r.hasRecipe ? '⚠️' : '—'}
                      </span>
                    )}
                </td>
                <td className="px-3 py-2 text-right">
                  {verdict(r)}
                  {r.savings !== null && r.savings !== 0 && (
                    <div className={`text-xs tabular-nums ${r.savings > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      {r.savings > 0 ? '−' : '+'}{fmt(Math.abs(r.savings))} ({((r.savingsPct ?? 0) * 100).toFixed(0)}%)
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  {r.craftCost !== null ? r.craftCities : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-center text-xs text-zinc-400 dark:text-zinc-600">{t(locale, 'footer')}</p>
    </div>
  );
}
