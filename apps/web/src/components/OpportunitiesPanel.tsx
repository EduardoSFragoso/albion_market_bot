import { useCallback, useEffect, useState } from 'react';
import { iconUrl, displayItemName } from '@albion/core/presentation';
import type { RankEntry } from '@albion/core';
import { api } from '../api';
import type { Locale } from '../i18n';
import { t } from '../i18n';
import { fmt } from './PriceTable';

interface Props {
  locale: Locale;
  premium: boolean;
  onOpen: (entry: RankEntry) => void;
}

interface Filters {
  tierMin: number;
  tierMax: number;
  ench: string; // '' = all
  sellCity: string; // 'Black Market' | 'best'
}

const EMPTY: Filters = { tierMin: 4, tierMax: 6, ench: '', sellCity: 'Black Market' };

export default function OpportunitiesPanel({ locale, premium, onOpen }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [entries, setEntries] = useState<RankEntry[] | null>(null);
  const [universe, setUniverse] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const tax = premium ? 4 : 8;
  const fee = premium ? 1.5 : 2.5;

  const scan = useCallback((f: Filters) => {
    let alive = true;
    setBusy(true);
    setErr('');
    api.rank({
      tierMin: f.tierMin, tierMax: f.tierMax, enchants: f.ench, sellCity: f.sellCity,
      buyMode: 'instant', rrr: 0.152, salesTax: tax, setupFee: fee,
    })
      .then((d) => {
        if (!alive) return;
        setEntries(d.entries);
        setUniverse(d.universeSize);
      })
      .catch((e) => alive && setErr(String(e.message ?? e)))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [tax, fee]);

  useEffect(() => { const clean = scan(filters); return clean; }, [scan, filters]);

  const selCls = 'rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
        <span className="font-medium text-zinc-500 dark:text-zinc-400">{t(locale, 'rankTier')}</span>
        <select className={selCls} value={filters.tierMin} onChange={(e) => setFilters((f) => ({ ...f, tierMin: Number(e.target.value) }))}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>T{n}</option>)}
        </select>
        <span className="text-zinc-400">–</span>
        <select className={selCls} value={filters.tierMax} onChange={(e) => setFilters((f) => ({ ...f, tierMax: Math.max(Number(e.target.value), f.tierMin) }))}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>T{n}</option>)}
        </select>
        <span className="ml-2 font-medium text-zinc-500 dark:text-zinc-400">{t(locale, 'rankEnch')}</span>
        <select className={selCls} value={filters.ench} onChange={(e) => setFilters((f) => ({ ...f, ench: e.target.value }))}>
          <option value="">{t(locale, 'rankEnchAll')}</option>
          {[0, 1, 2, 3].map((n) => <option key={n} value={String(n)}>.{n}</option>)}
        </select>
        <span className="ml-2 font-medium text-zinc-500 dark:text-zinc-400">{t(locale, 'rankSellCity')}</span>
        <select className={selCls} value={filters.sellCity} onChange={(e) => setFilters((f) => ({ ...f, sellCity: e.target.value }))}>
          <option value="Black Market">{t(locale, 'blackMarketShort')}</option>
          <option value="best">{t(locale, 'rankSellBest')}</option>
        </select>
        <button
          onClick={() => scan(filters)}
          disabled={busy}
          className="ml-auto rounded-md bg-zinc-800 px-3 py-1.5 font-semibold text-white disabled:opacity-50 dark:bg-amber-500 dark:text-zinc-950"
        >
          {busy ? t(locale, 'rankScanning') : t(locale, 'rankScan')}
        </button>
      </div>

      {err && <p className="py-4 text-center text-sm text-red-600">{t(locale, 'error')}: {err}</p>}

      {entries && entries.length === 0 && !busy && (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{t(locale, 'rankNone')}</p>
      )}

      {entries && entries.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          {/* table-fixed: a coluna do item não pode empurrar as demais —
              a última (COMPRAR EM) saía da viewport. Percentuais fixos + truncate. */}
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                <th className="w-[38%] px-3 py-2.5">#{t(locale, 'item')}</th>
                <th className="w-[14%] px-3 py-2.5 text-right">{t(locale, 'materialCost')}</th>
                <th className="w-[14%] px-3 py-2.5 text-right">{t(locale, 'netPrice')}</th>
                <th className="w-[18%] px-3 py-2.5 text-right">{t(locale, 'profit')}</th>
                <th className="w-[16%] px-3 py-2.5 text-right">{t(locale, 'buyMaterialsIn')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((r, i) => (
                <tr
                  key={r.itemId}
                  onClick={() => onOpen(r)}
                  className="cursor-pointer border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-zinc-400">{i + 1}</span>
                      <img src={iconUrl(r.itemId, 64)} alt="" className="h-8 w-8 shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-zinc-800 dark:text-zinc-200">{displayItemName(r, locale)}</div>
                        <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                          T{r.tier}{r.ench ? `.${r.ench}` : ''} · {r.sellCity}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{fmt(r.materialCost)}</td>
                  <td className="overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-300">{fmt(r.netPrice)}</td>
                  <td className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${r.profit > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                    {r.profit > 0 ? '+' : ''}{fmt(r.profit)} <span className="font-normal text-xs">({(r.profitPct * 100).toFixed(0)}%)</span>
                  </td>
                  <td className="overflow-hidden px-3 py-2 text-right" title={r.buyCity}>
                    <span className="inline-block max-w-full truncate tabular-nums text-zinc-500 dark:text-zinc-400">{r.buyCity}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-center text-xs text-zinc-400 dark:text-zinc-600">
        {t(locale, 'rankUniverse').replace('{n}', String(universe))} · RRR 15,2% · {t(locale, 'perUnit')}
      </p>
    </div>
  );
}
