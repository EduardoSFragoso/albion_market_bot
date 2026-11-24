import { useEffect, useState } from 'react';
import { iconUrl, displayName } from '@albion/core';
import type { ItemIndexEntry } from '@albion/core';
import type { Locale } from './i18n';
import { t } from './i18n';
import SearchBar from './components/SearchBar';
import PricesPanel from './components/PricesPanel';
import CraftPanel from './components/CraftPanel';
import FlipPanel from './components/FlipPanel';
import HistoryPanel from './components/HistoryPanel';
import OpportunitiesPanel from './components/OpportunitiesPanel';
import EnchantPanel from './components/EnchantPanel';
import { getItem } from '@albion/core';

type Tab = 'rank' | 'prices' | 'craft' | 'enchant' | 'flip' | 'history';

export default function App() {
  const [locale, setLocale] = useState<Locale>(() => (localStorage.getItem('locale') as Locale) ?? 'pt');
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [item, setItem] = useState<ItemIndexEntry | null>(() => {
    const saved = localStorage.getItem('lastItem');
    return saved ? JSON.parse(saved) : null;
  });
  const [tab, setTab] = useState<Tab>('rank');
  const [premium, setPremium] = useState(localStorage.getItem('premium') !== '0');

  useEffect(() => { localStorage.setItem('locale', locale); }, [locale]);
  useEffect(() => { localStorage.setItem('premium', premium ? '1' : '0'); }, [premium]);
  useEffect(() => {
    if (item) localStorage.setItem('lastItem', JSON.stringify(item));
  }, [item]);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('theme', dark ? 'dark' : 'light'); }, [dark]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'rank', label: t(locale, 'tabRank') },
    { id: 'prices', label: t(locale, 'tabPrices') },
    { id: 'craft', label: t(locale, 'tabCraft') },
    { id: 'enchant', label: t(locale, 'tabEnchant') },
    { id: 'flip', label: t(locale, 'tabFlip') },
    { id: 'history', label: t(locale, 'tabHistory') },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img src={iconUrl('T4_BAG', 1)} alt="" className="h-8 w-8" />
            <div>
              <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{t(locale, 'title')}</h1>
              <p className="hidden text-xs text-zinc-500 sm:block dark:text-zinc-400">{t(locale, 'subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPremium((p) => !p)}
              title={t(locale, 'salesTax')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ring-1 transition ${
                premium
                  ? 'bg-amber-500 text-white ring-amber-500'
                  : 'bg-transparent text-zinc-600 ring-zinc-300 hover:bg-zinc-100 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800'
              }`}
            >
              Premium
            </button>
            <button
              onClick={() => setLocale((l) => (l === 'pt' ? 'en' : 'pt'))}
              className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-300 hover:bg-zinc-100 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800"
            >
              {t(locale, 'langLabel')}
            </button>
            <button
              onClick={() => setDark((d) => !d)}
              aria-label={t(locale, 'themeLabel')}
              className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-300 hover:bg-zinc-100 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800"
            >
              {dark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <SearchBar onSelect={(i) => { setItem(i); setTab('prices'); }} locale={locale} />

        {item && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <img src={iconUrl(item.id, 3)} alt="" className="h-14 w-14" />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-zinc-900 dark:text-zinc-50">
                {displayName(item.id, locale)}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                T{item.tier}{item.ench ? `.${item.ench}` : ''} · {item.id}{item.craftable ? ' · ⚒ craftável' : ''}
              </p>
            </div>
          </div>
        )}

        <div className={`flex gap-1 rounded-lg bg-zinc-200/60 p-1 text-sm font-medium dark:bg-zinc-900 ${item ? 'mt-4 mb-4' : 'mt-4'}`}>
          {tabs.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`flex-1 rounded-md px-3 py-1.5 transition ${
                tab === tb.id
                  ? 'bg-white text-zinc-900 shadow dark:bg-zinc-800 dark:text-amber-400'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        <div className="min-h-[200px]">
          {tab === 'rank' && (
            <OpportunitiesPanel
              locale={locale}
              premium={premium}
              onOpen={(id) => {
                const it = getItem(id);
                if (it) { setItem(it); setTab('prices'); }
              }}
            />
          )}
          {tab !== 'rank' && !item && (
            <div className="mt-10 text-center">
              <img src={iconUrl('T8_MAIN_SWORD', 8)} alt="" className="mx-auto h-20 w-20 opacity-80" />
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">{t(locale, 'search')}</p>
            </div>
          )}
          {tab === 'prices' && item && <PricesPanel itemId={item.id} locale={locale} premium={premium} />}
          {tab === 'craft' && item && <CraftPanel item={item} locale={locale} premium={premium} />}
          {tab === 'enchant' && item && <EnchantPanel itemId={item.id} locale={locale} />}
          {tab === 'flip' && item && <FlipPanel itemId={item.id} locale={locale} premium={premium} />}
          {tab === 'history' && item && <HistoryPanel itemId={item.id} locale={locale} />}
        </div>
      </main>

      <footer className="mx-auto max-w-4xl px-4 pb-8 pt-4 text-center text-xs text-zinc-400 dark:text-zinc-600">
        {t(locale, 'footer')}
      </footer>
    </div>
  );
}
