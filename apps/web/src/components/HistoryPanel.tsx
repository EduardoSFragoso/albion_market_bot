import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { Locale } from '../i18n';
import { t } from '../i18n';

const COLORS = ['#d97706', '#0ea5e9', '#10b981', '#ec4899', '#8b5cf6', '#f43f5e', '#eab308', '#64748b'];

export default function HistoryPanel({ itemId, locale }: { itemId: string; locale: Locale }) {
  const [hist, setHist] = useState<Awaited<ReturnType<typeof api.history>>['history'] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setHist(null); setErr('');
    api.history(itemId, 14)
      .then((d) => alive && setHist(d.history))
      .catch((e) => alive && setErr(String(e.message ?? e)));
    return () => { alive = false; };
  }, [itemId]);

  const series = useMemo(() => {
    if (!hist) return [];
    return hist
      .filter((h) => h.data?.some((d) => d.avg_price > 0))
      .map((h) => ({
        location: h.location,
        points: h.data.map((d) => ({ t: Date.parse(d.timestamp), v: d.avg_price, volume: d.item_count })),
      }));
  }, [hist]);

  if (err) return <p className="py-6 text-center text-sm text-red-600">{t(locale, 'error')}: {err}</p>;
  if (!hist) return <p className="py-6 text-center text-sm text-zinc-500">{t(locale, 'loading')}</p>;
  if (!series.length) return <p className="py-6 text-center text-sm text-zinc-500">{t(locale, 'noData')}</p>;

  const W = 720, H = 220, PAD = 36;
  const now = Date.now(), ago = now - 14 * 86_400_000;
  const all = series.flatMap((s) => s.points.filter((p) => p.t >= ago - 86_400_000));
  const maxV = Math.max(...all.map((p) => p.v), 1);

  const x = (t: number) => PAD + ((t - ago) / (now - ago)) * (W - PAD - 12);
  const y = (v: number) => H - 24 - (v / maxV) * (H - PAD - 28);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {t(locale, 'historyAvg')} {t(locale, 'days')})
        </span>
        {series.map((s, i) => (
          <span key={s.location} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            {s.location}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD} x2={W - 12} y1={y(maxV * f)} y2={y(maxV * f)} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" strokeWidth="1" />
        ))}
        {series.map((s, i) => {
          const pts = s.points.filter((p) => p.t >= ago - 86_400_000).map((p) => `${x(p.t)},${y(p.v)}`).join(' ');
          return <polyline key={s.location} points={pts} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="2" strokeLinejoin="round" />;
        })}
      </svg>
    </div>
  );
}
