import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Sparkline } from './charts/Charts';
import type { Variation } from '../utils/stats';

export type StatTone = 'good' | 'cost' | 'neutral'; // good : monter est bien · cost : monter est une charge · neutral : ni l'un ni l'autre

interface Props {
  label: string;
  value: string;
  unit?: string; // ex. « Ar »
  hint?: string; // petite ligne sous le chiffre (ex. « 2 jour · 1 nuit »)
  variation?: Variation; // comparaison en %
  deltaText?: string; // à la place du % (ex. « +5 pts »)
  deltaDir?: 'up' | 'down' | 'flat';
  vsText?: string; // « par rapport à hier »
  tone?: StatTone;
  spark?: number[];
}

const toneClass = (dir: 'up' | 'down' | 'flat', tone: StatTone) => {
  if (dir === 'flat' || tone === 'neutral') return 'text-sky-300';
  const good = tone === 'good' ? dir === 'up' : dir === 'down';
  return good ? 'text-emerald-400' : 'text-amber-400';
};

export const StatCard: React.FC<Props> = ({ label, value, unit, hint, variation, deltaText, deltaDir, vsText, tone = 'good', spark }) => {
  const dir = deltaDir || variation?.dir || 'flat';
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;
  let delta: string | null = null;
  if (deltaText) delta = deltaText;
  else if (variation) delta = variation.pct === null ? (variation.dir === 'flat' ? 'Stable' : variation.dir === 'up' ? 'Nouveau' : 'En baisse') : `${variation.pct > 0 ? '+' : ''}${variation.pct} %`;
  return (
    <div className="bg-[#0f1722] border rounded-xl border-slate-700 p-3 flex flex-col gap-1 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-400 truncate">{label}</div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 leading-tight">
          <span className="text-xl sm:text-2xl font-bold font-mono text-white break-words">{value}</span>
          {unit && <span className="ml-1 text-xs text-slate-400">{unit}</span>}
        </div>
        {spark && <div className="shrink-0 pb-1"><Sparkline values={spark} /></div>}
      </div>
      {hint && <div className="text-[11px] text-slate-400 truncate">{hint}</div>}
      {delta !== null && (
        <div className={`flex items-center gap-1 text-xs font-semibold ${toneClass(dir, tone)}`}>
          <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{delta}</span>
          {vsText && <span className="font-normal text-slate-400 truncate">{vsText}</span>}
        </div>
      )}
    </div>
  );
};
