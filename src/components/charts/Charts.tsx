import React, { useMemo, useState } from 'react';

// Graphiques légers en SVG (aucune bibliothèque). Lisibles sur téléphone, sans chiffre qui déborde,
// et sans erreur avec 0, 1 ou beaucoup de données.

export const CHART_COLORS = ['#10b981', '#38bdf8', '#f59e0b', '#a78bfa', '#fb7185', '#94a3b8'];

/** 1 234 → « 1,2 k » · 1 500 000 → « 1,5 M » (court, pour les axes et les petites cartes). */
export const compactNumber = (n: number): string => {
  const a = Math.abs(n);
  const f = (v: number, s: string) => `${(Math.round(v * 10) / 10).toString().replace('.', ',')} ${s}`;
  if (a >= 1_000_000) return f(n / 1_000_000, 'M');
  if (a >= 1_000) return f(n / 1_000, 'k');
  return String(Math.round(n));
};

const safe = (n: number) => (Number.isFinite(n) ? n : 0);

type ChartLang = 'fr' | 'en';
// Les textes des graphiques sont fournis dans les deux langues ici (les graphiques sont exclus de la traduction automatique : data-notranslate)
const TXT = {
  fr: { empty: 'Aucune donnée sur cette période', tap: 'Touchez une barre pour voir la valeur', before: 'avant', prev: 'Période d\'avant', total: 'Total', others: 'Autres' },
  en: { empty: 'No data for this period', tap: 'Tap a bar to see its value', before: 'before', prev: 'Previous period', total: 'Total', others: 'Others' },
} as const;

// ---------- Barres ----------

export interface BarChartProps {
  values: number[];
  labels: string[];
  compare?: number[]; // période d'avant (petits traits)
  format?: (v: number) => string; // texte d'une valeur (légende, ex. « 5 000 Ar »)
  unit?: string; // ex. « missions »
  ariaLabel: string;
  emptyText?: string;
  height?: number;
  lang?: ChartLang;
}

export const BarChart: React.FC<BarChartProps> = ({ values, labels, compare, format, unit, ariaLabel, emptyText, height = 150, lang = 'fr' }) => {
  const tx = TXT[lang];
  const empty = emptyText ?? tx.empty;
  const [sel, setSel] = useState<number | null>(null);
  const vals = values.map(safe);
  const cmp = (compare || []).map(safe);
  const max = Math.max(1, ...vals, ...cmp);
  const total = vals.reduce((a, b) => a + b, 0);
  const W = 320, padL = 4, padR = 4, padT = 8, padB = 22;
  const innerW = W - padL - padR, innerH = height - padT - padB;
  const n = Math.max(1, vals.length);
  const slot = innerW / n;
  const barW = Math.max(1, Math.min(22, slot * 0.68));
  const every = n <= 12 ? 1 : n <= 24 ? 3 : n <= 31 ? 5 : Math.ceil(n / 7);
  const fmt = format || ((v: number) => String(Math.round(v)));
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const idx = sel !== null && sel < vals.length ? sel : null;

  const summary = useMemo(() => `${ariaLabel}. ${tx.total}: ${fmt(total)}${unit ? ' ' + unit : ''}.`, [ariaLabel, total, unit, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  if (vals.length === 0 || total === 0 && cmp.every(v => v === 0)) {
    return <div data-notranslate="" role="img" aria-label={`${ariaLabel}. ${empty}`} className="h-[96px] flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg">{empty}</div>;
  }

  return (
    <div data-notranslate="">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto select-none" role="img" aria-label={summary}>
        <line x1={padL} x2={W - padR} y1={padT + innerH} y2={padT + innerH} stroke="currentColor" className="text-slate-600" strokeWidth="1" />
        <line x1={padL} x2={W - padR} y1={padT} y2={padT} stroke="currentColor" className="text-slate-700" strokeWidth="0.5" strokeDasharray="3 3" />
        {vals.map((v, i) => {
          const cx = padL + slot * i + slot / 2;
          const h = Math.max(v > 0 ? 2 : 0, padT + innerH - y(v));
          const on = idx === i;
          return (
            <g key={i} onClick={() => setSel(on ? null : i)} style={{ cursor: 'pointer' }}>
              <rect x={padL + slot * i} y={padT} width={slot} height={innerH + padB} fill="transparent" />
              <rect x={cx - barW / 2} y={padT + innerH - h} width={barW} height={h} rx={Math.min(3, barW / 2)} fill={on ? '#34d399' : '#10b981'} opacity={idx === null || on ? 1 : 0.55} />
              {i % every === 0 && <text x={cx} y={height - 6} textAnchor="middle" fontSize="9" fill="currentColor" className="text-slate-400">{labels[i] ?? ''}</text>}
            </g>
          );
        })}
        {cmp.length > 0 && cmp.map((v, i) => i < n && v > 0 ? <line key={`c${i}`} x1={padL + slot * i + slot / 2 - barW / 2} x2={padL + slot * i + slot / 2 + barW / 2} y1={y(v)} y2={y(v)} stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" /> : null)}
        <text x={W - padR} y={padT - 1} textAnchor="end" fontSize="9" fill="currentColor" className="text-slate-400">{fmt(max)}</text>
      </svg>
      <div className="min-h-[20px] mt-1 text-xs text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1" aria-live="polite">
        {idx !== null
          ? <span><b className="text-white">{labels[idx]}</b> : {fmt(vals[idx])}{unit ? ` ${unit}` : ''}{cmp[idx] !== undefined ? ` (${tx.before}: ${fmt(cmp[idx])})` : ''}</span>
          : <span className="text-slate-500">{tx.tap}</span>}
        {compare && <span className="inline-flex items-center gap-1 text-slate-400"><span className="inline-block w-3 h-0.5 bg-amber-500 rounded" />{tx.prev}</span>}
      </div>
    </div>
  );
};

// ---------- Anneau ----------

export interface DonutItem { label: string; value: number }

export const DonutChart: React.FC<{ items: DonutItem[]; ariaLabel: string; centerLabel?: string; format?: (v: number) => string; emptyText?: string; lang?: ChartLang }> = ({ items, ariaLabel, centerLabel, format, emptyText, lang = 'fr' }) => {
  const tx = TXT[lang];
  const empty = emptyText ?? tx.empty;
  const clean = items.map(i => ({ ...i, value: Math.max(0, safe(i.value)) })).filter(i => i.value > 0);
  const total = clean.reduce((t, i) => t + i.value, 0);
  const fmt = format || ((v: number) => String(Math.round(v)));
  if (total === 0) return <div data-notranslate="" role="img" aria-label={`${ariaLabel}. ${empty}`} className="h-[96px] flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg">{empty}</div>;

  // Au-delà de 5 parts, le reste est regroupé dans « Autres »
  const shown = clean.length > 6 ? [...clean.slice(0, 5), { label: tx.others, value: clean.slice(5).reduce((t, i) => t + i.value, 0) }] : clean;
  const R = 42, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div data-notranslate="" className="flex flex-col sm:flex-row items-center gap-3">
      <svg viewBox="0 0 120 120" className="w-[132px] h-[132px] shrink-0" role="img" aria-label={`${ariaLabel}. ${shown.map(s => `${s.label} : ${fmt(s.value)}`).join(', ')}`}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="currentColor" className="text-slate-800" strokeWidth="16" />
        {shown.map((s, i) => {
          const len = (s.value / total) * C;
          const el = <circle key={i} cx="60" cy="60" r={R} fill="none" stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth="16" strokeDasharray={`${Math.max(0, len - (shown.length > 1 ? 1.5 : 0))} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 60 60)" />;
          acc += len;
          return el;
        })}
        <text x="60" y="58" textAnchor="middle" fontSize="18" fontWeight="700" fill="currentColor" className="text-white">{fmt(total)}</text>
        {centerLabel && <text x="60" y="73" textAnchor="middle" fontSize="8" fill="currentColor" className="text-slate-400">{centerLabel}</text>}
      </svg>
      <ul className="w-full min-w-0 space-y-1.5">
        {shown.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="truncate text-slate-200 flex-1 min-w-0">{s.label}</span>
            <span className="font-mono text-white">{fmt(s.value)}</span>
            <span className="font-mono text-xs text-slate-400 w-10 text-right">{Math.round((s.value / total) * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ---------- Mini-courbe (dans les cartes) ----------

export const Sparkline: React.FC<{ values: number[]; color?: string; width?: number; height?: number }> = ({ values, color = '#10b981', width = 80, height = 24 }) => {
  const v = values.map(safe);
  if (v.length < 2 || v.every(x => x === v[0])) return <svg width={width} height={height} aria-hidden="true"><line x1="0" x2={width} y1={height - 3} y2={height - 3} stroke={color} strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" /></svg>;
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * (width - 4) + 2},${height - 3 - ((x - min) / span) * (height - 6)}`).join(' ');
  return <svg width={width} height={height} aria-hidden="true"><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>;
};
