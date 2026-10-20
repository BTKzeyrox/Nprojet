import React from 'react';
import { CHART_COLORS, TXT, compactNumber, safe, type ChartLang } from './chartCommon';
import { XYChart, type XYSeries } from './XYChart';

// Graphiques en SVG (aucune bibliothèque). Lisibles sur téléphone, sans chiffre qui déborde,
// et sans erreur avec 0, 1 ou beaucoup de données. Le moteur principal est XYChart (barres, courbes, zones).
export { CHART_COLORS, compactNumber };
export { XYChart };
export type { XYSeries, XYChartProps, RefLine } from './XYChart';

// ---------- Barres (même appel qu'avant ; plus de détails : axes, grille, infobulle, moyenne) ----------

export interface BarChartProps {
  values: number[];
  labels: string[];
  fullLabels?: string[];
  label?: string; // nom de la série (légende, infobulle)
  compare?: number[]; // série de comparaison (période d'avant, dépenses…) tracée en pointillé
  format?: (v: number) => string; // texte d'une valeur exacte (ex. « 5 000 Ar »)
  unit?: string; // ex. « missions »
  ariaLabel: string;
  emptyText?: string;
  height?: number;
  lang?: ChartLang;
  compareLabel?: string; // nom de la série de comparaison (par défaut : « Période d'avant »)
}

export const BarChart: React.FC<BarChartProps> = ({ values, labels, fullLabels, label, compare, format, unit, ariaLabel, emptyText, height, lang = 'fr', compareLabel }) => {
  const tx = TXT[lang];
  const series: XYSeries[] = [{ key: 'v', label: label ?? ariaLabel, values, kind: 'bar' }];
  if (compare && compare.length > 0) series.push({ key: 'c', label: compareLabel ?? tx.prev, values: compare, kind: 'line', dashed: true, color: '#f59e0b' });
  return <XYChart labels={labels} fullLabels={fullLabels} series={series} format={format} unit={unit} ariaLabel={ariaLabel} emptyText={emptyText} height={height} lang={lang}
    summary="sum" showAverage legend={series.length > 1} variationBetween={series.length > 1 && !compareLabel ? ['v', 'c'] : undefined} />;
};

// ---------- Courbe avec zone (peut descendre sous zéro : vert au-dessus, rouge en dessous) ----------

export const LineChart: React.FC<{ values: number[]; labels: string[]; fullLabels?: string[]; label?: string; format?: (v: number) => string; ariaLabel: string; emptyText?: string; height?: number; lang?: ChartLang }> = ({ values, labels, fullLabels, label, format, ariaLabel, emptyText, height, lang = 'fr' }) => (
  <XYChart labels={labels} fullLabels={fullLabels} series={[{ key: 'v', label: label ?? ariaLabel, values, kind: 'area' }]} format={format} ariaLabel={ariaLabel} emptyText={emptyText} height={height} lang={lang} summary="last" signColors />
);

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
