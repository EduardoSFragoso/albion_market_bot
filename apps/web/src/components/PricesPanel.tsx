import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Locale } from '../i18n';
import { t } from '../i18n';
import PriceTable from './PriceTable';

export default function PricesPanel({ itemId, locale, premium }: { itemId: string; locale: Locale; premium: boolean }) {
  const [quality, setQuality] = useState(1);
  const [prices, setPrices] = useState<import('@albion/core').MarketPrice[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setPrices(null); setErr('');
    api.prices(itemId, quality)
      .then((d) => alive && setPrices(d.prices))
      .catch((e) => alive && setErr(String(e.message ?? e)));
    return () => { alive = false; };
  }, [itemId, quality]);

  if (err) return <p className="py-6 text-center text-sm text-red-600">{t(locale, 'error')}: {err}</p>;
  if (!prices) return <p className="py-6 text-center text-sm text-zinc-500">{t(locale, 'loading')}</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{t(locale, 'quality')}</span>
        {[1, 2, 3, 4, 5].map((q) => (
          <button
            key={q}
            onClick={() => setQuality(q)}
            className={`h-7 w-7 rounded-md text-xs font-semibold ring-1 transition ${
              quality === q
                ? premium
                  ? 'bg-amber-500 text-white ring-amber-500'
                  : 'bg-zinc-800 text-white ring-zinc-800 dark:bg-amber-500 dark:ring-amber-500'
                : 'bg-white text-zinc-500 ring-zinc-300 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-zinc-800'
            }`}
          >
            {q}
          </button>
        ))}
      </div>
      <PriceTable prices={prices} locale={locale} />
    </div>
  );
}
