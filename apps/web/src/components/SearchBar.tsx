import { useEffect, useMemo, useRef, useState } from 'react';
import { searchItems, iconUrl } from '@albion/core';
import type { ItemIndexEntry } from '@albion/core';
import type { Locale } from '../i18n';
import { t } from '../i18n';

interface Props {
  onSelect: (item: ItemIndexEntry) => void;
  locale: Locale;
}

export default function SearchBar({ onSelect, locale }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchItems(query, { locale, limit: 10 }), [query, locale]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (item: ItemIndexEntry) => {
    onSelect(item);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="relative" ref={boxRef}>
      <input
        value={query}
        placeholder={t(locale, 'search')}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !results.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); pick(results[hi]); }
          if (e.key === 'Escape') setOpen(false);
        }}
        className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
      />
      {open && query.trim().length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {results.length === 0 && (
            <div className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">{t(locale, 'noResults')}</div>
          )}
          {results.map((item, i) => (
            <button
              key={item.id}
              onMouseDown={(e) => { e.preventDefault(); pick(item); }}
              onMouseEnter={() => setHi(i)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${i === hi ? 'bg-amber-50 dark:bg-zinc-800' : ''}`}
            >
              <img src={iconUrl(item.id, 64)} alt="" className="h-8 w-8 shrink-0" loading="lazy" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-zinc-800 dark:text-zinc-100">
                  {item.ench > 0 ? `${(locale === 'pt' ? item.pt || item.en : item.en || item.pt)} .${item.ench}` : (locale === 'pt' ? item.pt || item.en : item.en || item.pt)}
                </span>
                <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                  T{item.tier}{item.ench ? `.${item.ench}` : ''} · {item.id}
                  {item.craftable ? ' · ⚒' : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
