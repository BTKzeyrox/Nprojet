import React, { useEffect, useRef, useState } from 'react';
import { Plus, Paperclip, BarChart3, CalendarDays, CheckCheck, X, Loader2 } from 'lucide-react';
import { POLL_MAX_DATES, POLL_MAX_OPTIONS, pollClean } from '../utils/pollRules';
import { ackQuestion } from '../utils/assistantPublish';

// Bouton « + » du formulaire des Actualités (BTK 2026-11-09) : Photo / fichier, Sondage, Choix de date, « J'ai lu ».
// Les trois derniers : réservés au responsable (le serveur ne garde un sondage que s'il vient de lui) ; même moteur que l'assistant (pollRules).
export type ExtraKind = 'poll' | 'date' | 'ack';
export interface Extra { kind: ExtraKind; question: string; options: string[] }
export const newExtra = (kind: ExtraKind): Extra => ({ kind, question: '', options: kind === 'ack' ? [] : ['', ''] });
export const extraMax = (kind: ExtraKind): number => (kind === 'date' ? POLL_MAX_DATES : POLL_MAX_OPTIONS);
/** Le sondage prêt à publier, ou la phrase qui dit ce qui manque. « J'ai lu » prend la 1re ligne du texte de la publication comme question. */
export function extraToPoll(x: Extra, text: string): { poll: { question: string; options: string[]; kind?: ExtraKind } } | { error: string } {
  if (x.kind === 'ack') {
    if (!text.trim()) return { error: 'Écris le texte de l’annonce : c’est lui que les personnes confirment avoir lu.' };
    return { poll: { question: ackQuestion(text), options: [], kind: 'ack' } };
  }
  const p = pollClean({ question: x.question, kind: x.kind, options: x.options });
  if (!p) return { error: x.kind === 'date' ? `Un choix de date demande une question et 2 à ${POLL_MAX_DATES} dates différentes.` : `Un sondage demande une question et 2 à ${POLL_MAX_OPTIONS} choix différents.` };
  return { poll: { question: p.question, options: p.options.map(o => o.text), ...(x.kind === 'date' ? { kind: 'date' as const } : {}) } };
}

export const PlusMenu: React.FC<{ isAdmin: boolean; disabled?: boolean; preparing?: boolean; light: boolean; hasExtra: boolean; onFile: () => void; onExtra: (k: ExtraKind) => void }> = ({ isAdmin, disabled, preparing, light, hasExtra, onFile, onExtra }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('touchstart', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('touchstart', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  const item = `w-full min-h-[44px] flex items-center gap-2.5 px-3 text-sm text-left cursor-pointer disabled:opacity-40 ${light ? 'hover:bg-slate-100 text-slate-800' : 'hover:bg-white/10 text-slate-100'}`;
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <div ref={ref} className="relative">
      <button type="button" data-composer-plus aria-label="Ajouter" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 min-h-[44px] px-3 text-sm font-semibold rounded-lg disabled:opacity-50 cursor-pointer ${light ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-white/10 text-slate-200'}`}>
        {preparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
        {preparing ? 'Préparation…' : 'Ajouter'}
      </button>
      {open && (
        <div role="menu" data-composer-plus-menu className={`absolute left-0 bottom-full mb-1 z-30 w-60 rounded-xl border shadow-lg overflow-hidden ${light ? 'bg-white border-slate-200' : 'bg-[#0f1722] border-slate-600'}`}>
          <button type="button" role="menuitem" data-plus-file className={item} onClick={pick(onFile)}><Paperclip className="w-4 h-4 shrink-0" />Photo / fichier</button>
          {isAdmin && <>
            <button type="button" role="menuitem" data-plus-poll className={item} onClick={pick(() => onExtra('poll'))}><BarChart3 className="w-4 h-4 shrink-0" />Sondage</button>
            <button type="button" role="menuitem" data-plus-date className={item} onClick={pick(() => onExtra('date'))}><CalendarDays className="w-4 h-4 shrink-0" />Choix de date</button>
            <button type="button" role="menuitem" data-plus-ack className={item} onClick={pick(() => onExtra('ack'))}><CheckCheck className="w-4 h-4 shrink-0" />« J’ai lu » (confirmation de lecture)</button>
          </>}
          {isAdmin && hasExtra && <div className={`px-3 py-1.5 text-[11px] border-t ${light ? 'text-slate-500 border-slate-200' : 'text-slate-400 border-slate-700'}`}>Un seul de ces trois par publication : le choisir remplace l’actuel.</div>}
        </div>
      )}
    </div>
  );
};

export const ExtraForm: React.FC<{ value: Extra; onChange: (v: Extra) => void; onRemove: () => void; disabled?: boolean; light: boolean }> = ({ value, onChange, onRemove, disabled, light }) => {
  const field = `w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-emerald-500 ${light ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0b1118] border-slate-600 text-slate-100'}`;
  const muted = light ? 'text-slate-500' : 'text-slate-400';
  const max = extraMax(value.kind);
  const title = value.kind === 'poll' ? 'Sondage' : value.kind === 'date' ? 'Choix de date' : '« J’ai lu »';
  const setOpt = (i: number, v: string) => onChange({ ...value, options: value.options.map((o, j) => (j === i ? v : o)) });
  return (
    <div data-composer-extra={value.kind} className={`rounded-xl border p-3 space-y-2 ${light ? 'border-emerald-300 bg-emerald-50/50' : 'border-emerald-700/60 bg-emerald-900/10'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-bold">{title}</div>
        <button type="button" data-extra-remove disabled={disabled} onClick={onRemove} aria-label={`Retirer : ${title}`} className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10 cursor-pointer disabled:opacity-40"><X className="w-4 h-4" /></button>
      </div>
      {value.kind === 'ack' ? (
        <div className={`text-xs ${muted}`}>Chaque personne touche « J’ai lu » sous ta publication. Tout le monde voit combien l’ont lu ; toi seul vois qui a lu et qui n’a pas encore lu. Le texte de la publication sert de question.</div>
      ) : (
        <>
          <input className={field} data-extra-question value={value.question} maxLength={200} disabled={disabled} onChange={e => onChange({ ...value, question: e.target.value })} placeholder={value.kind === 'date' ? 'Question (ex. Quand faisons-nous la réunion ?)' : 'Question (ex. Faut-il ouvrir samedi ?)'} />
          <div className="space-y-1.5">
            {value.options.map((o, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input className={field} data-extra-option value={o} maxLength={100} disabled={disabled} onChange={e => setOpt(i, e.target.value)} placeholder={value.kind === 'date' ? `Date ${i + 1} (ex. lundi 10 à 9 h)` : `Choix ${i + 1}`} aria-label={`${value.kind === 'date' ? 'Date' : 'Choix'} ${i + 1}`} />
                {value.options.length > 2 && <button type="button" disabled={disabled} onClick={() => onChange({ ...value, options: value.options.filter((_, j) => j !== i) })} aria-label={`Retirer le choix ${i + 1}`} className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10 cursor-pointer disabled:opacity-40"><X className="w-4 h-4" /></button>}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button type="button" data-extra-add disabled={disabled || value.options.length >= max} onClick={() => onChange({ ...value, options: [...value.options, ''] })} className={`min-h-[36px] px-3 rounded-lg border text-xs font-semibold cursor-pointer disabled:opacity-40 ${light ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-600 hover:bg-white/10'}`}>+ Ajouter {value.kind === 'date' ? 'une date' : 'un choix'}</button>
            <span className={`text-[11px] ${muted}`}>{value.kind === 'date' ? `2 à ${max} dates. Chacun coche toutes les dates où il est disponible.` : `2 à ${max} choix. Chacun vote pour un seul choix.`}</span>
          </div>
        </>
      )}
    </div>
  );
};
