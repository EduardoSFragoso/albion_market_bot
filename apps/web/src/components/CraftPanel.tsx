import { useEffect, useState } from 'react';
import { iconUrl, displayName } from '@albion/core';
import type { ItemIndexEntry } from '@albion/core';
import { api, type CraftResponse } from '../api';
import type { Locale } from '../i18n';
import { t } from '../i18n';
import { fmt } from './PriceTable';

export const CITIES = ['Thetford', 'Fort Sterling', 'Lymhurst', 'Bridgewatch', 'Martlock', 'Caerleon', 'Brecilien', 'Black Market'];

interface Props {
  item: ItemIndexEntry;
  locale: Locale;
  premium: boolean;
}

export default function CraftPanel({ item, locale, premium }: Props) {
  const [buyCity, setBuyCity] = useState('Caerleon');
  const [sellCity, setSellCity] = useState('Black Market');
  const [rrrMode, setRrrMode] = useState<'base' | 'bonus' | 'caerleon' | 'custom'>('base');
  const [rrr, setRrr] = useState(0.152);
  const [buyMode, setBuyMode] = useState<'instant' | 'order'>('instant');
  const tax = premium ? 4 : 8;
  const fee = premium ? 1.5 : 2.5;
  const [data, setData] = useState<CraftResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setState('loading');
    api.craft({ item: item.id, buyCity, sellCity, rrr, buyMode, salesTax: tax, setupFee: fee })
      .then((d) => { if (alive) { setData(d); setState('ok'); } })
      .catch((e) => { if (alive) { setError(String(e.message ?? e)); setState('error'); } });
    return () => { alive = false; };
  }, [item.id, buyCity, sellCity, rrr, buyMode, tax, fee]);

  const sel = 'rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';
  const label = 'mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400';

  if (!item.craftable) {
    return <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{t(locale, 'noRecipe')}</p>;
  }

  const r = data?.result;
  const profitable = (r?.profit ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={label}>{t(locale, 'buyMaterialsIn')}</label>
          <select value={buyCity} onChange={(e) => setBuyCity(e.target.value)} className={`${sel} w-full`}>
            {CITIES.filter((c) => c !== 'Black Market').map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>{t(locale, 'sellItemAt')}</label>
          <select value={sellCity} onChange={(e) => setSellCity(e.target.value)} className={`${sel} w-full`}>
            {CITIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>{t(locale, 'returnRate')}</label>
          <select
            value={rrrMode}
            onChange={(e) => {
              const v = e.target.value as any;
              setRrrMode(v);
              if (v === 'base') setRrr(0.152);
              if (v === 'bonus') setRrr(0.248);
              if (v === 'caerleon') setRrr(0.435);
            }}
            className={`${sel} w-full`}
          >
            <option value="base">{t(locale, 'rrrBase')}</option>
            <option value="bonus">{t(locale, 'rrrBonus')}</option>
            <option value="caerleon">{t(locale, 'rrrCaerleon')}</option>
            <option value="custom">{t(locale, 'custom')}</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>{t(locale, 'buyMode')}</label>
            <select value={buyMode} onChange={(e) => setBuyMode(e.target.value as any)} className={`${sel} w-full`}>
              <option value="instant">{t(locale, 'instantBuy')}</option>
              <option value="order">{t(locale, 'buyOrders')}</option>
            </select>
          </div>
          <div>
            <label className={label}>{t(locale, 'salesTax')}</label>
            <div className={`${sel} w-full text-zinc-500`}>
              {premium ? t(locale, 'premiumTax') : t(locale, 'baseTax')}
            </div>
          </div>
        </div>
      </div>

      {rrrMode === 'custom' && (
        <input
          type="range" min={0} max={0.5} step={0.001} value={rrr}
          onChange={(e) => setRrr(Number(e.target.value))}
          className="w-full accent-amber-500"
        />
      )}

      {state === 'loading' && <p className="py-6 text-center text-sm text-zinc-500">{t(locale, 'loading')}</p>}
      {state === 'error' && <p className="py-6 text-center text-sm text-red-600">{t(locale, 'error')}: {error}</p>}

      {state === 'ok' && data?.error === 'no-recipe' && (
        <p className="py-6 text-center text-sm text-zinc-500">{t(locale, 'noRecipe')}</p>
      )}

      {state === 'ok' && r?.ok && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Card title={t(locale, 'materialCost')} value={fmt(r.totalCost)} sub={`≈ ${fmt(r.materialCost / r.amountPerCraft)} ${t(locale, 'perUnit')}`} />
            <Card title={t(locale, 'revenue')} value={fmt(r.revenue)} sub={`${fmt(r.salePrice)} × ${r.amountPerCraft}`} />
            <Card
              title={t(locale, 'profit')}
              value={fmt(r.profit)}
              tone={profitable ? 'good' : 'bad'}
            />
            <Card
              title={t(locale, 'profitPct')}
              value={`${(r.profitPctOfCost * 100).toFixed(1)}%`}
              tone={profitable ? 'good' : 'bad'}
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                  <th className="px-4 py-2.5">{t(locale, 'material')}</th>
                  <th className="px-4 py-2.5 text-right">{t(locale, 'qty')}</th>
                  <th className="px-4 py-2.5 text-right">{t(locale, 'unit')}</th>
                  <th className="px-4 py-2.5 text-right">{t(locale, 'cost')}</th>
                </tr>
              </thead>
              <tbody>
                {r.materials.map((m) => {
                  const ch = data?.cheapest?.find((c) => c.id === m.id);
                  return (
                    <tr key={m.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <img src={iconUrl(m.id, 64)} alt="" className="h-7 w-7" loading="lazy" />
                          <span>
                            <span className="block font-medium text-zinc-800 dark:text-zinc-200">{displayName(m.id, locale)}</span>
                            {m.fallbackCity && (
                              <span className="block text-xs text-red-500 dark:text-red-400">
                                {t(locale, 'fallback')} {buyCity} — {m.fallbackCity}
                              </span>
                            )}
                            {!m.fallbackCity && ch && ch.city !== '—' && ch.city !== buyCity && (
                              <span className="block text-xs text-amber-600 dark:text-amber-400">
                                {t(locale, 'cheapestIn')} {ch.city} ({fmt(ch.unitPrice)})
                              </span>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                        {m.countPerCraft}
                        <span className="ml-1 text-xs text-zinc-400">→ {m.effectiveCount.toFixed(1)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                        {m.missingPrice ? <span className="text-red-500">?</span> : fmt(m.unitPrice)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-zinc-800 dark:text-zinc-200">
                        {m.missingPrice ? '—' : fmt(m.cost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {r.missingCities.length > 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              ⚠ sem preço recente: {r.missingCities.join(', ')} ({t(locale, 'noData')})
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Card({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100';
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{sub}</div>}
    </div>
  );
}
