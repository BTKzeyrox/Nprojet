import React, { useEffect, useId, useRef, useState } from 'react';
import { BAD, CHART_COLORS, GOOD, TXT, compactNumber, safe, type ChartLang } from './chartCommon';
import { labelStep, monotonePath, nearestIndex, niceScale, seriesStats, variationPct } from '../../utils/chartScale';

// Graphique professionnel en SVG (aucune bibliothèque) : barres (groupées ou empilées), courbes, zones, combinés.
// Axe vertical gradué, grille, ligne du zéro, infobulle au toucher / à la souris / au clavier, légende cliquable,
// moyenne, lignes de repère (objectif…), vert au-dessus de zéro et rouge en dessous, animation d'entrée.

export interface XYSeries { key: string; label: string; values: (number | null)[]; // null = pas de point (jour pas encore arrivé, prévision qui commence plus tard)
   kind?: 'bar' | 'line' | 'area'; color?: string; dashed?: boolean }
export interface RefLine { value: number; label: string; color?: string }

export interface XYChartProps {
  labels: string[]; // étiquettes courtes sous l'axe
  fullLabels?: string[]; // titres complets dans l'infobulle (par défaut : labels)
  series: XYSeries[];
  stacked?: boolean; // barres empilées
  format?: (v: number) => string; // valeur exacte (infobulle, résumé)
  axisFormat?: (v: number) => string; // graduations (par défaut : nombres courts)
  unit?: string;
  refLines?: RefLine[]; // traits horizontaux (objectif, seuil…)
  showAverage?: boolean; // trait pointillé de la moyenne de la 1re série
  summary?: 'sum' | 'last' | false; // ligne de résumé sous le graphique
  signColors?: boolean; // vert au-dessus de zéro, rouge en dessous
  variationBetween?: [string, string]; // [série actuelle, série d'avant] : variation en % dans l'infobulle
  integer?: boolean; // graduations entières (défaut : automatique si toutes les valeurs sont entières)
  legend?: boolean; // défaut : si plusieurs séries
  ariaLabel: string;
  emptyText?: string;
  height?: number;
  lang?: ChartLang;
}

const EmptyBox: React.FC<{ aria: string; text: string }> = ({ aria, text }) => (
  <div data-notranslate="" role="img" aria-label={`${aria}. ${text}`} className="h-[120px] flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg">{text}</div>
);

export const XYChart: React.FC<XYChartProps> = (p) => {
  const { labels, series, stacked = false, unit, refLines = [], showAverage = false, summary = false, signColors = false, ariaLabel, lang = 'fr' } = p;
  const tx = TXT[lang];
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const box = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(340);
  const [hidden, setHidden] = useState<string[]>([]);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setW(Math.max(220, Math.round(el.clientWidth || 340)));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = series.map((s, i) => ({
    ...s, kind: s.kind ?? 'bar', color: s.color ?? CHART_COLORS[i % CHART_COLORS.length],
    has: s.values.map(v => v !== null && v !== undefined && Number.isFinite(v)), // faux = pas de point
    values: s.values.map(v => (v === null || v === undefined ? 0 : safe(v))),
  }));
  const visible = all.filter(s => !hidden.includes(s.key));
  const n = Math.max(1, labels.length, ...all.map(s => s.values.length));
  const fmt = p.format ?? ((v: number) => String(Math.round(v)));
  const axisFmt = p.axisFormat ?? compactNumber;
  const nothing = all.length === 0 || all.every(s => s.values.every(v => v === 0)) && refLines.length === 0;
  if (nothing) return <EmptyBox aria={ariaLabel} text={p.emptyText ?? tx.empty} />;

  // --- échelle verticale (toujours jusqu'à zéro) ---
  const bars = visible.filter(s => s.kind === 'bar');
  const lines = visible.filter(s => s.kind !== 'bar');
  let lo = 0, hi = 0;
  if (stacked) {
    for (let i = 0; i < n; i++) {
      hi = Math.max(hi, bars.reduce((t, s) => t + Math.max(0, s.values[i] ?? 0), 0));
      lo = Math.min(lo, bars.reduce((t, s) => t + Math.min(0, s.values[i] ?? 0), 0));
    }
  } else for (const s of bars) for (const v of s.values) { hi = Math.max(hi, v); lo = Math.min(lo, v); }
  for (const s of lines) for (const v of s.values) { hi = Math.max(hi, v); lo = Math.min(lo, v); }
  for (const r of refLines) { hi = Math.max(hi, safe(r.value)); lo = Math.min(lo, safe(r.value)); }
  const integer = p.integer ?? all.every(s => s.values.every(Number.isInteger));
  const H = p.height ?? (w < 520 ? 260 : 340);
  const padT = 14, padB = 28, padR = 10;
  const target = Math.min(6, Math.max(3, Math.floor((H - padT - padB) / 46) + 1));
  const scale = niceScale(lo, hi, target, integer);
  const axisLabels = scale.ticks.map(axisFmt);
  const padL = Math.max(30, Math.max(...axisLabels.map(l => l.length)) * 6 + 12);
  const innerW = Math.max(40, w - padL - padR), innerH = H - padT - padB;
  const slot = innerW / n;
  const X = (i: number) => padL + slot * i + slot / 2;
  const Y = (v: number) => padT + innerH - ((v - scale.min) / (scale.max - scale.min)) * innerH;
  const zeroY = Y(0);
  const step = labelStep(n, innerW, Math.max(26, Math.max(0, ...labels.map(l => String(l).length)) * 6.2 + 10)); // écart selon la longueur des étiquettes
  const idx = active !== null && active < n ? active : null;

  // --- barres : position de chaque barre ---
  const gap = bars.length > 1 && !stacked ? 2 : 0;
  const groupW = Math.max(1, Math.min(slot * 0.74, stacked ? 44 : 24 * Math.max(1, bars.length)));
  const barW = Math.max(1, stacked ? groupW : groupW / Math.max(1, bars.length) - gap);
  const barRects: { x: number; y: number; h: number; v: number; si: number; i: number; color: string }[] = [];
  bars.forEach((s, bi) => {
    const sIdx = all.findIndex(a => a.key === s.key);
    for (let i = 0; i < n; i++) {
      const v = s.values[i] ?? 0;
      if (v === 0 || !s.has[i]) continue;
      let from = 0;
      if (stacked) for (let k = 0; k < bi; k++) { const o = bars[k].values[i] ?? 0; if ((o >= 0) === (v >= 0)) from += o; }
      const a = Y(from), b = Y(from + v);
      const x = stacked ? X(i) - groupW / 2 : X(i) - groupW / 2 + bi * (barW + gap);
      barRects.push({ x, y: Math.min(a, b), h: Math.max(1.5, Math.abs(a - b)), v, si: sIdx, i, color: signColors && !stacked ? (v >= 0 ? GOOD : BAD) : s.color });
    }
  });

  // --- repères ---
  const primary = visible[0];
  const stats = (() => {
    if (!primary) return null;
    const at = primary.values.slice(0, n).map((_, i) => i).filter(i => primary.has[i]);
    const sub = seriesStats(at.map(i => primary.values[i]));
    return { ...sub, bestIndex: at[sub.bestIndex] ?? -1, worstIndex: at[sub.worstIndex] ?? -1 };
  })();
  const pick = (e: React.PointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return nearestIndex((e.clientX - r.left) * (w / r.width), padL, innerW, n);
  };
  const toggle = (key: string) => setHidden(h => (h.includes(key) ? h.filter(k => k !== key) : visible.length > 1 ? [...h, key] : h)); // on garde toujours une série visible
  const showLegend = p.legend ?? all.length > 1;
  const fullLabel = (i: number) => p.fullLabels?.[i] ?? labels[i] ?? '';
  const valueText = (v: number) => `${fmt(v)}${unit ? ` ${unit}` : ''}`;
  const varPair = p.variationBetween ? [all.find(s => s.key === p.variationBetween![0]), all.find(s => s.key === p.variationBetween![1])] : null;
  const variation = idx !== null && varPair?.[0] && varPair[1] && varPair[0].has[idx] && varPair[1].has[idx] ? variationPct(varPair[0].values[idx] ?? 0, varPair[1].values[idx] ?? 0) : null;
  const aria = `${ariaLabel}. ${stats ? `${tx.total}: ${valueText(stats.total)}.` : ''}`;
  const markers = n <= 40;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setActive(a => Math.min(n - 1, (a ?? -1) + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setActive(a => Math.max(0, (a ?? n) - 1)); }
    else if (e.key === 'Escape') setActive(null);
  };

  return (
    <div data-notranslate="" ref={box} className="relative w-full">
      {showLegend && (
        <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label={lang === 'en' ? 'Series' : 'Séries'}>
          {all.map(s => {
            const off = hidden.includes(s.key);
            return (
              <button key={s.key} type="button" aria-pressed={!off} onClick={() => toggle(s.key)}
                className={`min-h-[36px] px-2.5 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 ${off ? 'border-slate-700 text-slate-500 line-through' : 'border-slate-600 text-slate-200 bg-slate-900/60'}`}>
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: off ? '#475569' : s.color }} />{s.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="relative">
        <svg ref={svgRef} width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={aria} tabIndex={0} onKeyDown={onKey} onBlur={() => setActive(null)}
          onPointerDown={e => { const i = pick(e); setActive(a => (a === i && e.pointerType !== 'mouse' ? null : i)); }}
          onPointerMove={e => { if (e.pointerType === 'mouse' || e.buttons) setActive(pick(e)); }}
          onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null); }}
          className="block select-none outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded" style={{ touchAction: 'pan-y' }}>
          <defs>
            {all.map((s, i) => (
              <linearGradient key={s.key} id={`${uid}g${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={s.kind === 'area' ? 0.4 : 1} />
                <stop offset="100%" stopColor={s.color} stopOpacity={s.kind === 'area' ? 0.02 : 0.62} />
              </linearGradient>
            ))}
            <linearGradient id={`${uid}up`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GOOD} stopOpacity="0.4" /><stop offset="100%" stopColor={GOOD} stopOpacity="0.02" /></linearGradient>
            <linearGradient id={`${uid}dn`} x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor={BAD} stopOpacity="0.4" /><stop offset="100%" stopColor={BAD} stopOpacity="0.02" /></linearGradient>
            <clipPath id={`${uid}ca`}><rect x={padL} y={0} width={innerW} height={Math.max(0, zeroY)} /></clipPath>
            <clipPath id={`${uid}cb`}><rect x={padL} y={zeroY} width={innerW} height={Math.max(0, H - zeroY)} /></clipPath>
          </defs>

          {/* grille et axe vertical */}
          {scale.ticks.map((t, i) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} stroke="currentColor" className={t === 0 ? 'text-slate-500' : 'text-slate-800'} strokeWidth={t === 0 ? 1.2 : 1} strokeDasharray={t === 0 ? undefined : '2 4'} />
              <text x={padL - 6} y={Y(t) + 3.5} textAnchor="end" fontSize="10" fill="currentColor" className="text-slate-400">{axisLabels[i]}</text>
            </g>
          ))}

          {/* barres */}
          {barRects.map((r, k) => (
            <rect key={k} className="chart-bar" x={r.x} y={r.y} width={barW} height={r.h} rx={Math.min(3, barW / 2)}
              fill={signColors && !stacked ? r.color : `url(#${uid}g${r.si})`} opacity={idx === null || idx === r.i ? 1 : 0.5}
              style={{ transformOrigin: r.v >= 0 ? 'center bottom' : 'center top' }} />
          ))}

          {/* zones et courbes */}
          {lines.map(s => {
            const sIdx = all.findIndex(a => a.key === s.key);
            const segs: [number, number][][] = [];
            let run: [number, number][] = [];
            for (let i = 0; i < n; i++) {
              if (s.has[i]) run.push([X(i), Y(s.values[i] ?? 0)]);
              else if (run.length) { segs.push(run); run = []; }
            }
            if (run.length) segs.push(run);
            const vals = s.values.slice(0, n).filter((_, i) => s.has[i]);
            const crosses = !s.dashed && signColors && vals.some(v => v < 0) && vals.some(v => v > 0);
            const solid = s.dashed ? s.color : signColors && !crosses ? (vals.some(v => v < 0) ? BAD : GOOD) : s.color; // une prévision en pointillé garde sa couleur
            return (
              <g key={s.key}>
                {segs.map((pts, k) => {
                  const d = monotonePath(pts);
                  const area = `${d}L${pts[pts.length - 1][0]},${zeroY}L${pts[0][0]},${zeroY}Z`;
                  if (crosses) {
                    return (
                      <g key={k}>
                        {s.kind === 'area' && <><path className="chart-area" d={area} fill={`url(#${uid}up)`} clipPath={`url(#${uid}ca)`} /><path className="chart-area" d={area} fill={`url(#${uid}dn)`} clipPath={`url(#${uid}cb)`} /></>}
                        <path className="chart-line" pathLength={1} d={d} fill="none" stroke={GOOD} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${uid}ca)`} />
                        <path className="chart-line" pathLength={1} d={d} fill="none" stroke={BAD} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${uid}cb)`} />
                      </g>
                    );
                  }
                  return (
                    <g key={k}>
                      {s.kind === 'area' && pts.length > 1 && <path className="chart-area" d={area} fill={signColors ? `url(#${uid}${solid === BAD ? 'dn' : 'up'})` : `url(#${uid}g${sIdx})`} />}
                      <path className={s.dashed ? 'chart-area' : 'chart-line'} pathLength={1} d={d} fill="none" stroke={solid} strokeWidth={s.dashed ? 1.8 : 2.2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* moyenne et repères */}
          {showAverage && stats && stats.avg !== 0 && (
            <g>
              <line x1={padL} x2={w - padR} y1={Y(stats.avg)} y2={Y(stats.avg)} stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="6 4" opacity="0.9" />
              <text x={w - padR - 2} y={Y(stats.avg) - 3} textAnchor="end" fontSize="9.5" fill="#f59e0b">{tx.avg} {axisFmt(stats.avg)}</text>
            </g>
          )}
          {refLines.map(r => (
            <g key={r.label}>
              <line x1={padL} x2={w - padR} y1={Y(r.value)} y2={Y(r.value)} stroke={r.color ?? '#a78bfa'} strokeWidth="1.4" strokeDasharray="7 4" />
              <text x={padL + 3} y={Y(r.value) - 4} fontSize="9.5" fontWeight="600" fill={r.color ?? '#a78bfa'}>{r.label} · {axisFmt(r.value)}</text>
            </g>
          ))}

          {/* points */}
          {lines.filter(s => !s.dashed).map(s => s.values.slice(0, n).map((v, i) => s.has[i] && (markers || idx === i) ? (
            <circle key={`${s.key}${i}`} cx={X(i)} cy={Y(v)} r={idx === i ? 5 : 2.6} fill={idx === i ? '#0b1220' : s.color} stroke={signColors ? (v < 0 ? BAD : GOOD) : s.color} strokeWidth={idx === i ? 2.4 : 0} />
          ) : null))}
          {idx !== null && lines.filter(s => s.dashed && s.has[idx]).map(s => <circle key={`d${s.key}`} cx={X(idx)} cy={Y(s.values[idx] ?? 0)} r={4} fill="#0b1220" stroke={s.color} strokeWidth="2" />)}

          {/* trait de lecture */}
          {idx !== null && <line x1={X(idx)} x2={X(idx)} y1={padT} y2={padT + innerH} stroke="currentColor" className="text-slate-400" strokeWidth="1" strokeDasharray="3 3" />}

          {/* axe du bas */}
          {labels.map((l, i) => (i % step === 0 || i === idx) ? (
            <text key={i} x={X(i)} y={H - 8} textAnchor={i === 0 && step > 1 ? 'start' : 'middle'} fontSize="10" fill="currentColor" className={idx === i ? 'text-white' : 'text-slate-400'} fontWeight={idx === i ? 700 : 400}>{l}</text>
          ) : null)}
        </svg>

        {idx !== null && (
          <div className="absolute top-1 pointer-events-none z-10 min-w-[140px] max-w-[220px] rounded-lg border border-slate-600 bg-[#0b1220]/95 px-3 py-2 shadow-lg text-xs text-slate-200 space-y-1"
            style={X(idx) > w / 2 ? { right: Math.max(4, w - X(idx) + 10) } : { left: Math.max(4, X(idx) + 10) }} aria-live="polite">
            <div className="font-bold text-white">{fullLabel(idx)}</div>
            {visible.map(s => (
              <div key={s.key} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 min-w-0"><span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} /><span className="truncate">{s.label}</span></span>
                <span className="font-mono text-white whitespace-nowrap">{s.has[idx] ? valueText(s.values[idx] ?? 0) : '—'}</span>
              </div>
            ))}
            {stacked && bars.length > 1 && <div className="flex items-center justify-between gap-3 border-t border-slate-700 pt-1"><span>{tx.total}</span><span className="font-mono text-white">{valueText(bars.reduce((t, s) => t + (s.values[idx] ?? 0), 0))}</span></div>}
            {variation !== null && <div className={variation > 0 ? 'text-emerald-400' : variation < 0 ? 'text-rose-400' : 'text-slate-300'}>{variation > 0 ? '▲ +' : variation < 0 ? '▼ ' : '= '}{variation} % {tx.vsPrev}</div>}
          </div>
        )}
      </div>

      <div className="mt-1.5 min-h-[20px] text-xs text-slate-300 flex flex-wrap items-center gap-x-4 gap-y-1">
        {summary && stats && primary ? (summary === 'sum'
          ? <><span>{tx.total} <b className="text-white font-mono">{valueText(stats.total)}</b></span><span>{tx.avg} <b className="text-white font-mono">{valueText(Math.round(stats.avg * 10) / 10)}</b></span>{stats.max > 0 && <span>{tx.best} <b className="text-white">{fullLabel(stats.bestIndex)}</b> <b className="text-white font-mono">{valueText(stats.max)}</b></span>}</>
          : <><span>{tx.last} <b className="text-white font-mono">{valueText(stats.last)}</b></span><span>{tx.min} <b className="text-white font-mono">{valueText(stats.min)}</b></span><span>{tx.max} <b className="text-white font-mono">{valueText(stats.max)}</b></span></>) : null}
        <span className="text-slate-500">{tx.tapChart}</span>
      </div>
    </div>
  );
};
