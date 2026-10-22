import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';
import { explain } from '../utils/snapshotDb';
import type { FigureId } from '../utils/siteSnapshot';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { formatCurrencyAr } from '../utils/formatUtils';

// Bouton « Pourquoi ce chiffre ? » : montre la formule, la période, les composantes, les plus grosses lignes et les sources. Admin seulement (rien si pas admin).
export const WhyFigure: React.FC<{ id: FigureId; range?: { start: string; end: string }; lang: 'fr' | 'en' }> = ({ id, range, lang }) => {
  const [open, setOpen] = useState(false);
  useLockBodyScroll(open);
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const e = open ? explain(id, range) : null;
  if (!explain(id, range) && !open) return null;
  const fmt = (v: number | null, unit: 'Ar' | '%' | 'count') => (v === null ? '—' : unit === 'Ar' ? formatCurrencyAr(v) : unit === '%' ? `${v} %` : String(v));
  const dmy = (d: string) => d.split('-').reverse().join('/');
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t('Pourquoi ce chiffre ?', 'Why this figure?')} title={t('Pourquoi ce chiffre ?', 'Why this figure?')}
        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-white"><HelpCircle className="w-4 h-4" /></button>
      {open && e && createPortal(
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" role="dialog" aria-modal="true" onClick={() => setOpen(false)} data-notranslate="">
          <div className="w-full sm:max-w-lg max-h-[88dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0f1722] border border-slate-700 p-4 space-y-3" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-start gap-2">
              <h2 className="flex-1 text-base font-bold text-white">{e.name[lang]} : {fmt(e.value, e.unit)}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t('Fermer', 'Close')} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-slate-300"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-200">{e.formula[lang]}</p>
            <p className="text-xs text-slate-400">{e.period ? t(`Période : du ${dmy(e.period.start)} au ${dmy(e.period.end)}`, `Period: ${e.period.start} to ${e.period.end}`) : t('Depuis le début', 'Since the start')}</p>
            {e.missing && <p className="text-xs text-amber-300">{e.missing[lang]}</p>}
            {e.parts.length > 0 && (
              <ul className="space-y-1">{e.parts.map((p, i) => (
                <li key={i} className="flex justify-between gap-2 text-sm text-slate-200"><span>{p.sign} {p.label[lang]}</span><b className="text-white shrink-0">{fmt(p.value, p.label.fr.includes('(%)') ? '%' : p.label.fr.startsWith('Missions') ? 'count' : 'Ar')}</b></li>
              ))}</ul>
            )}
            {e.lines.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-300 mb-1">{t(`Les plus grosses lignes (${e.lines.length} sur ${e.total_lines})`, `Largest lines (${e.lines.length} of ${e.total_lines})`)}</p>
                <ul className="space-y-1">{e.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-2 text-xs text-slate-300"><span className="min-w-0 truncate">{l.date ? `${dmy(l.date)} · ` : ''}{l.label}</span><span className="shrink-0">{fmt(l.value, e.unit === 'count' ? 'count' : 'Ar')}</span></li>
                ))}</ul>
              </div>
            )}
            <p className="text-[11px] text-slate-400">{e.sources[lang]}</p>
          </div>
        </div>, document.body)}
    </>
  );
};
