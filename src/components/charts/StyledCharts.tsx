import React, { useEffect, useId, useRef, useState } from 'react';
import { BAD, GOOD, compactNumber, safe, type ChartLang } from './chartCommon';
import { labelStep, monotonePath, niceScale } from '../../utils/chartScale';

// Trois graphiques lisibles, un style chacun (demande de BTK, 2026-10-29) :
//  • MoneyFlowChart       : « Argent reçu et dépenses » : 3 gros chiffres, puis 2 courbes douces avec zone colorée.
//  • BilledReceivedBars   : « Facturé et reçu » : barres LARGES avec onglets (Les deux / Facturé / Reçu), le reçu dans le facturé.
//  • ActivityGrid         : « Missions faites par jour » : calendrier de carrés, plus c'est foncé, plus il y a de missions.
// Pas de bibliothèque. Même thème que les autres graphiques (currentColor + classes slate). Toucher un point, une barre ou un carré affiche le détail SOUS le graphique.

const TEXT = {
  fr: { empty: 'Aucune donnée sur cette période', tap: 'Touchez le graphique pour voir les valeurs', both: 'Les deux', less: 'Moins', more: 'Plus', total: 'Total', avg: 'Moyenne', best: 'Meilleur', none: 'Aucune mission', mission: 'mission', missions: 'missions' },
  en: { empty: 'No data for this period', tap: 'Tap the chart to see the values', both: 'Both', less: 'Less', more: 'More', total: 'Total', avg: 'Average', best: 'Best', none: 'No mission', mission: 'mission', missions: 'missions' },
} as const;

const tile = 'rounded-lg bg-slate-900/60 border border-slate-800 px-2 py-2 text-center min-w-0';

const useWidth = (min = 220, start = 340) => {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(start);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setW(Math.max(min, Math.round(el.clientWidth || start)));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [min, start]);
  return [ref, w] as const;
};

const Empty: React.FC<{ aria: string; text: string }> = ({ aria, text }) => (
  <div data-notranslate="" role="img" aria-label={`${aria}. ${text}`} className="h-[120px] flex items-center justify-center text-sm text-slate-400 border border-dashed border-slate-700 rounded-lg">{text}</div>
);

const num = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// ───────────────────────── 1. Argent reçu et dépenses : courbes douces ─────────────────────────
export interface MoneyFlowProps {
  labels: string[]; fullLabels?: string[];
  inflow: (number | null)[]; outflow: (number | null)[];
  format: (v: number) => string; axisFormat?: (v: number) => string;
  inLabel: string; outLabel: string; balanceLabel: string;
  ariaLabel: string; lang?: ChartLang;
}

export const MoneyFlowChart: React.FC<MoneyFlowProps> = ({ labels, fullLabels, inflow, outflow, format, axisFormat, inLabel, outLabel, balanceLabel, ariaLabel, lang = 'fr' }) => {
  const tx = TEXT[lang];
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [box, w] = useWidth();
  const [idx, setIdx] = useState<number | null>(null);
  const n = labels.length;
  const totalIn = inflow.reduce<number>((a, v) => a + num(v), 0);
  const totalOut = outflow.reduce<number>((a, v) => a + num(v), 0);
  const balance = totalIn - totalOut;
  const ax = axisFormat ?? compactNumber;
  const full = (i: number) => fullLabels?.[i] ?? labels[i] ?? '';

  const tiles = (
    <div className="grid grid-cols-3 gap-2">
      <div className={tile}><div className="text-[11px] text-slate-400 truncate">{inLabel}</div><div className="text-sm sm:text-base font-bold break-words" style={{ color: GOOD }}>{format(totalIn)}</div></div>
      <div className={tile}><div className="text-[11px] text-slate-400 truncate">{outLabel}</div><div className="text-sm sm:text-base font-bold break-words" style={{ color: BAD }}>{format(totalOut)}</div></div>
      <div className={tile}><div className="text-[11px] text-slate-400 truncate">{balanceLabel}</div><div className="text-sm sm:text-base font-bold break-words" style={{ color: balance < 0 ? BAD : GOOD }}>{format(balance)}</div></div>
    </div>
  );
  if (n === 0 || (totalIn === 0 && totalOut === 0)) return <div data-notranslate="" className="space-y-2">{tiles}<Empty aria={ariaLabel} text={tx.empty} /></div>;

  const H = 200, padL = 44, padR = 12, padT = 12, padB = 26;
  const innerW = Math.max(60, w - padL - padR), innerH = H - padT - padB;
  const max = Math.max(1, ...inflow.map(num), ...outflow.map(num));
  const sc = niceScale(0, max, 4);
  const X = (i: number) => padL + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const Y = (v: number) => padT + innerH * (1 - (safe(v) - sc.min) / (sc.max - sc.min || 1));
  const base = Y(0);
  const step = labelStep(n, innerW, 50);
  const lastRegular = Math.floor((n - 1) / step) * step; // la dernière étiquette ne doit pas toucher la précédente
  const showLabel = (i: number) => i % step === 0 || (i === n - 1 && n - 1 - lastRegular >= step * 0.7);

  const draw = (values: (number | null)[], color: string, key: string) => {
    const segs: [number, number][][] = []; let cur: [number, number][] = [];
    values.forEach((v, i) => { if (v === null || v === undefined || !Number.isFinite(v)) { if (cur.length) segs.push(cur); cur = []; } else cur.push([X(i), Y(v)]); });
    if (cur.length) segs.push(cur);
    return segs.map((pts, si) => {
      const d = monotonePath(pts);
      const area = pts.length > 1 ? `${d}L${pts[pts.length - 1][0]},${base}L${pts[0][0]},${base}Z` : '';
      return (
        <g key={`${key}${si}`}>
          {area && <path className="chart-area" d={area} fill={`url(#${uid}${key})`} />}
          <path className="chart-line" pathLength={1} d={d} fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
          {pts.length === 1 && <circle cx={pts[0][0]} cy={pts[0][1]} r="3.5" fill={color} />}
        </g>
      );
    });
  };

  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const x = clientX - r.left;
    setIdx(n === 1 ? 0 : Math.min(n - 1, Math.max(0, Math.round(((x - padL) / (innerW || 1)) * (n - 1)))));
  };

  return (
    <div data-notranslate="" ref={box} className="space-y-2">
      {tiles}
      <svg role="img" aria-label={ariaLabel} width="100%" height={H} viewBox={`0 0 ${w} ${H}`} tabIndex={0} className="block select-none outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded" style={{ touchAction: 'pan-y' }}
        onPointerMove={e => pick(e.clientX, e.currentTarget)} onPointerDown={e => pick(e.clientX, e.currentTarget)} onPointerLeave={e => { if (e.pointerType === 'mouse') setIdx(null); }}
        onKeyDown={e => { if (e.key === 'ArrowRight') { e.preventDefault(); setIdx(i => Math.min(n - 1, (i ?? -1) + 1)); } else if (e.key === 'ArrowLeft') { e.preventDefault(); setIdx(i => Math.max(0, (i ?? n) - 1)); } else if (e.key === 'Escape') setIdx(null); }}>
        <defs>
          <linearGradient id={`${uid}in`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GOOD} stopOpacity="0.38" /><stop offset="100%" stopColor={GOOD} stopOpacity="0.02" /></linearGradient>
          <linearGradient id={`${uid}out`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BAD} stopOpacity="0.3" /><stop offset="100%" stopColor={BAD} stopOpacity="0.02" /></linearGradient>
        </defs>
        {sc.ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={w - padR} y1={Y(t)} y2={Y(t)} stroke="currentColor" className={t === 0 ? 'text-slate-500' : 'text-slate-800'} strokeWidth="1" strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={padL - 6} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="currentColor" className="text-slate-400">{ax(t)}</text>
          </g>
        ))}
        {draw(outflow, BAD, 'out')}
        {draw(inflow, GOOD, 'in')}
        {idx !== null && <line x1={X(idx)} x2={X(idx)} y1={padT} y2={padT + innerH} stroke="currentColor" className="text-slate-400" strokeWidth="1" strokeDasharray="3 3" />}
        {idx !== null && inflow[idx] != null && <circle cx={X(idx)} cy={Y(num(inflow[idx]))} r="5" fill="#0b1220" stroke={GOOD} strokeWidth="2.4" />}
        {idx !== null && outflow[idx] != null && <circle cx={X(idx)} cy={Y(num(outflow[idx]))} r="5" fill="#0b1220" stroke={BAD} strokeWidth="2.4" />}
        {labels.map((l, i) => showLabel(i) ? <text key={i} x={X(i)} y={H - 8} textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'} fontSize="11" fill="currentColor" className={idx === i ? 'text-white' : 'text-slate-400'}>{l}</text> : null)}
      </svg>
      <div aria-live="polite" className="min-h-[44px] rounded-lg bg-slate-900/60 border border-slate-800 px-3 py-2 text-xs text-slate-300">
        {idx === null ? <span className="text-slate-400">{tx.tap}</span> : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><b className="text-white">{full(idx)}</b>
            <span style={{ color: GOOD }}>{inLabel} : <b>{format(num(inflow[idx]))}</b></span>
            <span style={{ color: BAD }}>{outLabel} : <b>{format(num(outflow[idx]))}</b></span></div>
        )}
      </div>
    </div>
  );
};

// ───────────────────────── 2. Facturé et reçu : barres larges avec onglets ─────────────────────────
export interface BilledReceivedProps {
  labels: string[]; fullLabels?: string[];
  billed: (number | null)[]; received: (number | null)[];
  format: (v: number) => string; axisFormat?: (v: number) => string;
  billedLabel: string; receivedLabel: string; leftLabel: string;
  ariaLabel: string; lang?: ChartLang;
}
type Tab = 'both' | 'billed' | 'received';
const BILLED_COLOR = '#38bdf8';

export const BilledReceivedBars: React.FC<BilledReceivedProps> = ({ labels, fullLabels, billed, received, format, axisFormat, billedLabel, receivedLabel, leftLabel, ariaLabel, lang = 'fr' }) => {
  const tx = TEXT[lang];
  const [box, w] = useWidth();
  const [tab, setTab] = useState<Tab>('both');
  const [idx, setIdx] = useState<number | null>(null);
  const n = labels.length;
  const totalB = billed.reduce<number>((a, v) => a + num(v), 0);
  const totalR = received.reduce<number>((a, v) => a + num(v), 0);
  const left = Math.max(0, totalB - totalR);
  const ax = axisFormat ?? compactNumber;
  const full = (i: number) => fullLabels?.[i] ?? labels[i] ?? '';

  const tiles = (
    <div className="grid grid-cols-3 gap-2">
      <div className={tile}><div className="text-[11px] text-slate-400 truncate">{billedLabel}</div><div className="text-sm sm:text-base font-bold break-words" style={{ color: BILLED_COLOR }}>{format(totalB)}</div></div>
      <div className={tile}><div className="text-[11px] text-slate-400 truncate">{receivedLabel}</div><div className="text-sm sm:text-base font-bold break-words" style={{ color: GOOD }}>{format(totalR)}</div></div>
      <div className={tile}><div className="text-[11px] text-slate-400 truncate">{leftLabel}</div><div className="text-sm sm:text-base font-bold break-words text-amber-400">{format(left)}</div></div>
    </div>
  );
  if (n === 0 || (totalB === 0 && totalR === 0)) return <div data-notranslate="" className="space-y-2">{tiles}<Empty aria={ariaLabel} text={tx.empty} /></div>;

  const tabs: { id: Tab; label: string }[] = [{ id: 'both', label: tx.both }, { id: 'billed', label: billedLabel }, { id: 'received', label: receivedLabel }];
  const H = 210, padL = 44, padT = 14, padB = 28, padR = 8;
  const innerH = H - padT - padB;
  const BAND = 30; // largeur minimale d'une barre + son espace : on fait défiler plutôt que d'écraser les barres
  const plotW = Math.max(w - padL, n * BAND + padR);
  const band = (plotW - padR) / n;
  const barW = Math.min(34, Math.max(12, band * 0.72));
  const vals = (t: Tab) => (t === 'billed' ? billed : t === 'received' ? received : billed.map((v, i) => Math.max(num(v), num(received[i]))));
  const max = Math.max(1, ...vals(tab).map(num));
  const sc = niceScale(0, max, 4);
  const Y = (v: number) => padT + innerH * (1 - (safe(v) - sc.min) / (sc.max - sc.min || 1));
  const base = Y(0);
  const step = labelStep(n, plotW - padR, 40);
  const bars = (i: number) => {
    const cx = i * band + band / 2;
    const b = num(billed[i]), r = num(received[i]);
    const act = idx === null || idx === i ? 1 : 0.45;
    const rect = (x: number, v: number, color: string, wid: number, key: string) => v > 0 ? <rect key={key} className="chart-bar" x={x} y={Y(v)} width={wid} height={Math.max(1, base - Y(v))} rx={Math.min(4, wid / 2)} fill={color} opacity={act} /> : null;
    if (tab === 'billed') return rect(cx - barW / 2, b, BILLED_COLOR, barW, `b${i}`);
    if (tab === 'received') return rect(cx - barW / 2, r, GOOD, barW, `r${i}`);
    return <g key={i}>{rect(cx - barW / 2, Math.max(b, r), 'rgba(56,189,248,0.38)', barW, `bb${i}`)}{rect(cx - barW * 0.3, r, GOOD, barW * 0.6, `rr${i}`)}</g>;
  };
  const pickBar = (clientX: number, el: SVGSVGElement) => { const x = clientX - el.getBoundingClientRect().left; setIdx(Math.min(n - 1, Math.max(0, Math.floor(x / band)))); };

  return (
    <div data-notranslate="" ref={box} className="space-y-2">
      {tiles}
      <div role="tablist" aria-label={ariaLabel} className="flex gap-1.5">
        {tabs.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setIdx(null); }}
            className={`min-h-[40px] px-3 rounded-lg border text-xs font-semibold flex-1 sm:flex-none ${tab === t.id ? 'border-sky-500 bg-sky-500/15 text-white' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}>{t.label}</button>
        ))}
      </div>
      <div className="flex">
        <svg width={padL} height={H} aria-hidden="true" className="shrink-0">
          {sc.ticks.map(t => <text key={t} x={padL - 6} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="currentColor" className="text-slate-400">{ax(t)}</text>)}
        </svg>
        <div className="overflow-x-auto flex-1 min-w-0">
          <svg role="img" aria-label={ariaLabel} width={plotW} height={H} className="block select-none" style={{ touchAction: 'pan-x pan-y' }}
            onPointerDown={e => pickBar(e.clientX, e.currentTarget)} onPointerMove={e => { if (e.pointerType === 'mouse') pickBar(e.clientX, e.currentTarget); }} onPointerLeave={e => { if (e.pointerType === 'mouse') setIdx(null); }}>
            {sc.ticks.map(t => <line key={t} x1={0} x2={plotW} y1={Y(t)} y2={Y(t)} stroke="currentColor" className={t === 0 ? 'text-slate-500' : 'text-slate-800'} strokeWidth="1" strokeDasharray={t === 0 ? undefined : '3 4'} />)}
            {labels.map((_, i) => bars(i))}
            {labels.map((l, i) => (i % step === 0) ? <text key={i} x={i * band + band / 2} y={H - 9} textAnchor="middle" fontSize="11" fill="currentColor" className={idx === i ? 'text-white' : 'text-slate-400'}>{l}</text> : null)}
          </svg>
        </div>
      </div>
      <div aria-live="polite" className="min-h-[44px] rounded-lg bg-slate-900/60 border border-slate-800 px-3 py-2 text-xs text-slate-300">
        {idx === null ? <span className="text-slate-400">{tx.tap}</span> : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><b className="text-white">{full(idx)}</b>
            <span style={{ color: BILLED_COLOR }}>{billedLabel} : <b>{format(num(billed[idx]))}</b></span>
            <span style={{ color: GOOD }}>{receivedLabel} : <b>{format(num(received[idx]))}</b></span></div>
        )}
      </div>
    </div>
  );
};

// ───────────────────────── 3. Missions faites : calendrier de carrés ─────────────────────────
export interface ActivityGridProps {
  labels: string[]; fullLabels?: string[];
  values: (number | null)[]; // null = pas encore arrivé
  ariaLabel: string; lang?: ChartLang;
}

export const ActivityGrid: React.FC<ActivityGridProps> = ({ labels, fullLabels, values, ariaLabel, lang = 'fr' }) => {
  const tx = TEXT[lang];
  const [idx, setIdx] = useState<number | null>(null);
  const n = labels.length;
  const real = values.map((v, i) => ({ v: v === null || v === undefined || !Number.isFinite(v) ? null : (v as number), i })).filter((x): x is { v: number; i: number } => x.v !== null);
  const total = real.reduce((a, x) => a + x.v, 0);
  const avg = real.length ? Math.round((total / real.length) * 10) / 10 : 0;
  const best = real.reduce<{ v: number; i: number } | null>((b, x) => (b === null || x.v > b.v ? x : b), null);
  const max = Math.max(1, ...real.map(x => x.v));
  const full = (i: number) => fullLabels?.[i] ?? labels[i] ?? '';
  const noun = (v: number) => (v === 1 ? tx.mission : tx.missions);
  const fmtAvg = String(avg).replace('.', lang === 'fr' ? ',' : '.');

  const tiles = (
    <div className="grid grid-cols-3 gap-2">
      <div className={tile}><div className="text-[11px] text-slate-400 truncate">{tx.total}</div><div className="text-lg font-bold text-white font-mono">{total}</div></div>
      <div className={tile}><div className="text-[11px] text-slate-400 truncate">{tx.avg}</div><div className="text-lg font-bold text-white font-mono">{fmtAvg}</div></div>
      <div className={tile}><div className="text-[11px] text-slate-400 truncate">{tx.best}</div><div className="text-lg font-bold text-white font-mono">{best && best.v > 0 ? best.v : '—'}</div></div>
    </div>
  );
  if (n === 0) return <div data-notranslate="" className="space-y-2">{tiles}<Empty aria={ariaLabel} text={tx.empty} /></div>;

  const cols = n <= 7 ? n : 7;
  const alphaOf = (v: number) => 0.18 + 0.82 * (v / max);
  const cell = (v: number | null, i: number) => {
    const selected = idx === i;
    const a = v !== null && v > 0 ? alphaOf(v) : 0;
    return (
      <button key={i} type="button" onClick={() => setIdx(selected ? null : i)} aria-pressed={selected}
        aria-label={`${full(i)} : ${v === null ? '—' : `${v} ${noun(v)}`}`}
        className={`relative aspect-square min-h-[40px] rounded-lg flex flex-col items-center justify-center overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${v === null ? 'border border-dashed border-slate-700' : v === 0 ? 'bg-slate-800/70 border border-slate-700' : 'border border-emerald-500/40'} ${selected ? 'ring-2 ring-white' : ''}`}
        style={v !== null && v > 0 ? { background: `rgba(16,185,129,${a})`, color: a > 0.55 ? '#ffffff' : undefined } : undefined}>
        <span className={`absolute top-0.5 left-1 text-[9px] leading-none ${v !== null && v > 0 && a > 0.55 ? 'text-white/80' : 'text-slate-400'}`}>{labels[i]}</span>
        <span className={`text-base font-bold font-mono ${v !== null && v > 0 ? (a > 0.55 ? 'text-white' : 'text-slate-100') : 'text-slate-500'}`}>{v === null ? '' : v}</span>
      </button>
    );
  };

  return (
    <div data-notranslate="" className="space-y-2">
      {tiles}
      <div role="group" aria-label={ariaLabel} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {values.map((v, i) => cell(v === null || v === undefined || !Number.isFinite(v) ? null : v, i))}
      </div>
      <div className="flex items-center justify-end gap-1.5 text-[11px] text-slate-400" aria-hidden="true">
        <span>{tx.less}</span>
        {[0.18, 0.4, 0.62, 0.84, 1].map(a => <span key={a} className="inline-block w-4 h-4 rounded" style={{ background: `rgba(16,185,129,${a})` }} />)}
        <span>{tx.more}</span>
      </div>
      <div aria-live="polite" className="min-h-[44px] rounded-lg bg-slate-900/60 border border-slate-800 px-3 py-2 text-xs text-slate-300">
        {idx === null ? <span className="text-slate-400">{tx.tap}</span> : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><b className="text-white">{full(idx)}</b>
            <span>{values[idx] === null || values[idx] === undefined ? '—' : num(values[idx]) === 0 ? tx.none : `${num(values[idx])} ${noun(num(values[idx]))}`}</span></div>
        )}
      </div>
    </div>
  );
};
