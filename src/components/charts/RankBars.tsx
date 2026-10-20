import React from 'react';
import { TXT, type ChartLang } from './chartCommon';
import { rankBars } from '../../utils/chartParts';

// Classement en barres horizontales (employés, clients, types, produits). La plus grande valeur = barre pleine.
// Les valeurs négatives (ex. une marge) sont en rouge, avec leur signe ; la longueur de la barre suit la valeur absolue.
export interface RankItem {
  key: string;
  label: string;
  value: number;
  valueText?: string; // texte de la valeur (par défaut : le nombre arrondi)
  sub?: React.ReactNode; // ligne de détail sous la barre
  onClick?: () => void; // si donné, le nom devient un bouton
}

export const RankBars: React.FC<{ items: RankItem[]; ariaLabel: string; lang?: ChartLang; format?: (v: number) => string; emptyText?: string; limit?: number; showShare?: boolean; barClass?: string }> = ({ items, ariaLabel, lang = 'fr', format, emptyText, limit, showShare, barClass }) => {
  const tx = TXT[lang];
  const [all, setAll] = React.useState(false);
  if (items.length === 0) return <div data-notranslate="" role="img" aria-label={`${ariaLabel}. ${emptyText ?? tx.empty}`} className="text-sm text-slate-400">{emptyText ?? tx.empty}</div>;
  const shown = limit && !all ? items.slice(0, limit) : items;
  const num = (v: number) => (Number.isFinite(v) ? v : 0); // une valeur fausse (NaN) s'affiche comme 0, jamais comme « NaN »
  const bars = rankBars(shown.map(i => num(i.value)));
  const fmt = format || ((v: number) => String(Math.round(v)));
  return (
    <div data-notranslate="" className="space-y-2">
      <ol aria-label={ariaLabel} className="space-y-1.5">
        {shown.map((it, i) => {
          const b = bars[i];
          return (
            <li key={it.key} className="rounded-lg bg-slate-900/60 border border-slate-800 px-2.5 py-2">
              <div className="flex items-center gap-2">
                <span className="w-5 text-center font-mono text-xs text-slate-500">{i + 1}</span>
                {it.onClick
                  ? <button type="button" onClick={it.onClick} className="min-w-0 flex-1 text-left text-sm font-semibold text-white truncate hover:underline min-h-[28px]">{it.label}</button>
                  : <span className="min-w-0 flex-1 text-sm font-semibold text-white truncate">{it.label}</span>}
                <span className={`font-mono text-sm whitespace-nowrap ${b.negative ? 'text-rose-400' : 'text-white'}`}>{it.valueText ?? `${b.negative ? '−' : ''}${fmt(Math.abs(num(it.value)))}`}</span>
                {showShare && b.share !== null && <span className="font-mono text-xs text-slate-400 w-10 text-right">{`${b.share} %`}</span>}
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
                <div className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${b.negative ? 'bg-rose-500' : barClass || 'bg-emerald-500'}`} style={{ width: `${b.width}%` }} />
              </div>
              {it.sub && <div className="mt-1">{it.sub}</div>}
            </li>
          );
        })}
      </ol>
      {limit && items.length > limit && (
        <button type="button" onClick={() => setAll(v => !v)} className="w-full min-h-[40px] rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200 text-sm">
          {all ? (lang === 'en' ? 'Show less' : 'Voir moins') : `${tx.seeAll} (${items.length})`}
        </button>
      )}
    </div>
  );
};
