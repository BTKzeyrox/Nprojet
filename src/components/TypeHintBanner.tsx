import React from 'react';
import type { HintKind } from '../utils/sheetRetype';

/** La phrase de la proposition (aucun changement n'est fait sans clic). */
export function hintText(name: string, kind: HintKind, sample: string[], options: string[] | undefined, t: (fr: string, en: string) => string): string {
  const ex = sample.slice(0, 3).join(', ');
  switch (kind) {
    case 'code': return t(`La colonne « ${name} » ressemble à des codes (${ex}…). En faire une colonne Code ? Les nouvelles lignes recevront le code suivant toutes seules.`, `Column “${name}” looks like codes (${ex}…). Make it a Code column? New rows will get the next code by themselves.`);
    case 'date': return t(`La colonne « ${name} » contient des dates (${ex}…). La passer en type Date ? Les dates se mettront en forme toutes seules.`, `Column “${name}” contains dates (${ex}…). Switch it to the Date type? Dates will format themselves.`);
    case 'time': return t(`La colonne « ${name} » contient des heures (${ex}…). La passer en type Heure ?`, `Column “${name}” contains times (${ex}…). Switch it to the Time type?`);
    case 'phone': return t(`La colonne « ${name} » contient des numéros de téléphone. La passer en type Téléphone ? Les espaces se mettront tout seuls.`, `Column “${name}” contains phone numbers. Switch it to the Phone type? Spaces will be added by themselves.`);
    case 'number': return t(`La colonne « ${name} » ne contient que des nombres. La passer en type Nombre ? Tu auras la somme en bas et le clavier des chiffres.`, `Column “${name}” only contains numbers. Switch it to the Number type? You will get the total at the bottom and the numeric keyboard.`);
    default: return t(`La colonne « ${name} » reprend toujours les mêmes mots (${(options || []).slice(0, 4).join(', ')}). En faire une liste de choix ?`, `Column “${name}” always repeats the same words (${(options || []).slice(0, 4).join(', ')}). Make it a list of choices?`);
  }
}


const btn = 'inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-600 text-slate-200 text-xs font-semibold hover:bg-slate-700/60 cursor-pointer';
/** Bandeau « cette colonne ressemble à… En faire une colonne … ? » : Oui / Non merci. */
export const TypeHintBanner: React.FC<{ name: string; kind: HintKind; sample: string[]; options?: string[]; t: (fr: string, en: string) => string; onAccept: () => void; onDismiss: () => void }> = ({ name, kind, sample, options, t, onAccept, onDismiss }) => (
  <div className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-xs text-slate-100 flex flex-wrap items-center gap-2" role="status" data-testid="type-hint">
    <span className="flex-1 min-w-[200px]">{hintText(name, kind, sample, options, t)}</span>
    <button className={`${btn} bg-sky-600 border-sky-500 text-white`} data-testid="type-hint-accept" onClick={onAccept}>{t('Oui, transformer', 'Yes, convert')}</button>
    <button className={btn} data-testid="type-hint-dismiss" onClick={onDismiss}>{t('Non merci', 'No thanks')}</button>
  </div>
);
