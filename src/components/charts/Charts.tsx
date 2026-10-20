import React, { useId, useState } from 'react';
import { CHART_COLORS, TXT, compactNumber, type ChartLang } from './chartCommon';
import { centerFontSize, clip, donutParts, sparkShape, toggleSelection, validSelection } from '../../utils/chartParts';
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

// ---------- Anneau (on touche une part, ou sa ligne de légende, pour la mettre en avant) ----------

export interface DonutItem { label: string; value: number }

export const DonutChart: React.FC<{ items: DonutItem[]; ariaLabel: string; centerLabel?: string; format?: (v: number) => string; emptyText?: string; lang?: ChartLang; defaultSelected?: number }> = ({ items, ariaLabel, centerLabel, format, emptyText, lang = 'fr', defaultSelected }) => {
  const tx = TXT[lang];
  const empty = emptyText ?? tx.empty;
  const [picked, setPicked] = useState<number | null>(defaultSelected ?? null);
  const { parts, total } = donutParts(items, tx.others);
  const fmt = format || ((v: number) => String(Math.round(v)));
  if (total === 0) return <div data-notranslate="" role="img" aria-label={`${ariaLabel}. ${empty}`} className="h-[96px] flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg">{empty}</div>;

  const sel = validSelection(picked, parts.length); // une sélection qui n'existe plus (données changées) est ignorée
  const chosen = sel === null ? null : parts[sel];
  const R = 42, C = 2 * Math.PI * R;
  const centerMain = chosen ? fmt(chosen.value) : fmt(total);
  const colorAt = (i: number) => CHART_COLORS[i % CHART_COLORS.length];
  const toggle = (i: number) => setPicked(toggleSelection(sel, i));
  return (
    <div data-notranslate="" className="space-y-2" onKeyDown={e => { if (e.key === 'Escape') setPicked(null); }}>
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <svg viewBox="0 0 120 120" className="w-[148px] h-[148px] shrink-0 touch-manipulation" role="img" aria-label={`${ariaLabel}. ${parts.map(s => `${s.label} : ${fmt(s.value)}`).join(', ')}`}>
          <circle cx="60" cy="60" r={R} fill="none" stroke="currentColor" className="text-slate-800" strokeWidth="16" />
          {parts.map((s, i) => {
            const len = s.len * C;
            const dash = `${Math.max(0, len - (parts.length > 1 ? 1.5 : 0))} ${C}`;
            const common = { cx: 60, cy: 60, r: R, fill: 'none', strokeDasharray: dash, strokeDashoffset: -s.start * C, transform: 'rotate(-90 60 60)' } as const;
            return (
              <g key={i} onClick={() => toggle(i)} style={{ cursor: 'pointer' }}>
                <circle {...common} stroke={colorAt(i)} strokeWidth={sel === i ? 21 : 16} opacity={sel === null || sel === i ? 1 : 0.3} style={{ transition: 'opacity .2s, stroke-width .2s' }} />
                <circle {...common} stroke="transparent" strokeWidth="28" /> {/* zone de toucher plus large que la part visible */}
              </g>
            );
          })}
          {chosen ? (
            <g onClick={() => setPicked(null)} style={{ cursor: 'pointer' }}>
              <circle cx="60" cy="60" r="30" fill="transparent" />
              <text x="60" y="49" textAnchor="middle" fontSize="8" fill="currentColor" className="text-slate-300">{clip(chosen.label, 14)}</text>
              <text x="60" y="64" textAnchor="middle" fontSize={centerFontSize(centerMain)} fontWeight="700" fill="currentColor" className="text-white">{centerMain}</text>
              <text x="60" y="77" textAnchor="middle" fontSize="9" fill={colorAt(sel as number)}>{`${chosen.pct} %`}</text>
            </g>
          ) : (
            <>
              <text x="60" y="58" textAnchor="middle" fontSize={centerFontSize(centerMain)} fontWeight="700" fill="currentColor" className="text-white">{centerMain}</text>
              {centerLabel && <text x="60" y="73" textAnchor="middle" fontSize="8" fill="currentColor" className="text-slate-400">{centerLabel}</text>}
            </>
          )}
        </svg>
        <ul className="w-full min-w-0 space-y-1">
          {parts.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <button type="button" aria-pressed={sel === i} onClick={() => toggle(i)}
                className={`w-full min-h-[44px] flex items-center gap-2 text-sm text-left rounded-lg px-2 border transition-colors ${sel === i ? 'bg-slate-800 border-slate-600' : 'border-transparent hover:bg-slate-800/60'} ${sel !== null && sel !== i ? 'opacity-60' : ''}`}>
                <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: colorAt(i) }} />
                <span className="truncate text-slate-200 flex-1 min-w-0">{s.label}</span>
                <span className="font-mono text-white">{fmt(s.value)}</span>
                <span className="font-mono text-xs text-slate-400 w-10 text-right">{`${s.pct} %`}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="text-[11px] text-slate-500" aria-live="polite">
        {chosen ? `${chosen.label} : ${fmt(chosen.value)} · ${chosen.pct} % ${tx.share}` : parts.length > 1 ? tx.tapDonut : ''}
      </div>
    </div>
  );
};

// ---------- Mini-courbe (dans les cartes) : zone colorée, point final, couleur selon la tendance ----------

export const Sparkline: React.FC<{ values: number[]; color?: string; width?: number; height?: number }> = ({ values, color = '#10b981', width = 96, height = 34 }) => {
  const gid = `spark${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const sh = sparkShape(values, width, height);
  if (sh.empty) return <svg width={width} height={height} aria-hidden="true" />;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" x2={width} y1={height - 1} y2={height - 1} stroke="#475569" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 3" />
      {!sh.flat && <path d={sh.area} fill={`url(#${gid})`} />}
      <polyline points={sh.line} fill="none" stroke={color} strokeOpacity={sh.flat ? 0.5 : 1} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {sh.last && <circle cx={sh.last.x} cy={sh.last.y} r="3" fill={color} stroke="#0f1722" strokeWidth="1.5" />}
    </svg>
  );
};

export { RankBars } from './RankBars';
export type { RankItem } from './RankBars';
export { Gauge } from './Gauge';
