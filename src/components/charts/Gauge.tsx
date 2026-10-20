import React from 'react';
import { GAUGE, gaugeShape } from '../../utils/chartParts';

// Jauge d'objectif en demi-cercle. Le remplissage s'arrête à 100 % (au-delà, le chiffre au centre dit « 130 % »).
// Le petit trait blanc montre où on devrait en être aujourd'hui (rythme du mois) : plus l'arc est loin devant, mieux c'est.
export type GaugeState = 'good' | 'ok' | 'warn' | 'over';
const STATE_COLOR: Record<GaugeState, string> = { good: '#10b981', ok: '#38bdf8', warn: '#f59e0b', over: '#fb7185' };

export const Gauge: React.FC<{ pct: number; state: GaugeState; label: string; detail: string; stateText: string; markPct?: number; markText?: string }> = ({ pct, state, label, detail, stateText, markPct, markText }) => {
  const g = gaugeShape(pct, markPct);
  const color = STATE_COLOR[state];
  const { cx, cy, r } = GAUGE;
  const arc = `M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <div data-notranslate="" className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-center min-w-0">
      <svg viewBox="0 0 120 74" className="w-full max-w-[150px] mx-auto" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, g.shownPct)} aria-label={`${label} : ${g.shownPct} %. ${detail}. ${stateText}${markText ? `. ${markText}` : ''}`}>
        <path d={arc} fill="none" stroke="currentColor" className="text-slate-800" strokeWidth="12" strokeLinecap="round" />
        {g.dash > 0 && <path d={arc} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${g.dash} ${GAUGE.arcLength}`} style={{ transition: 'stroke-dasharray .6s ease' }} />}
        {g.mark && <line x1={g.mark.x1} y1={g.mark.y1} x2={g.mark.x2} y2={g.mark.y2} stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="19" fontWeight="700" fill="currentColor" className="text-white">{`${g.shownPct} %`}</text>
      </svg>
      <div className="text-xs font-bold text-white truncate">{label}</div>
      <div className="text-[11px] text-slate-300 break-words">{detail}</div>
      <div className="text-[11px] font-semibold" style={{ color }}>{stateText}</div>
    </div>
  );
};
