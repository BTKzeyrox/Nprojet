import React, { useState } from 'react';
import * as S from '../utils/sheets';
import * as A from '../utils/sheetAuto';
import { isFormula } from '../utils/sheetFormula';
import { showToast } from './ToastHost';

/**
 * Champ de saisie « intelligent » d'une colonne (module 19) : utilisé par la grille ET par la vue Formulaire, donc les deux se comportent pareil.
 * - date : on tape des chiffres, les « / » arrivent seuls (28102026 → 28/10/2026) ; « t » = aujourd'hui ; la valeur gardée reste AAAA-MM-JJ ;
 * - nombre, montant : milliers automatiques ; téléphone : espaces automatiques ; heure : HH:MM ;
 * - bon clavier du téléphone pendant la saisie (chiffres, virgule, téléphone) ;
 * - texte : suggestions des mots déjà tapés dans la colonne ;
 * - une formule (« = ») passe sans être touchée ; une saisie refusée n'écrase JAMAIS la valeur d'avant : le texte revient et la raison est dite.
 */
export const SmartField: React.FC<{
  col: S.Column; value: string; shown: string; lang: A.Lang; today: string; readOnly?: boolean; err?: boolean;
  onCommit: (stored: string) => void; listId?: string; className?: string; placeholder?: string; autoFocus?: boolean; ariaLabel?: string; onProblem?: (msg: string) => void;
}> = ({ col, value, shown, lang, today, readOnly, err, onCommit, listId, className = '', placeholder, autoFocus, ariaLabel, onProblem }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const kb = A.keyboardFor(col.type);
  const typed = A.isTypedKind(col.type);
  const numeric = S.isNumType(col.type);
  const editing = draft !== null;
  const shownText = isFormula(value) ? shown : typed ? A.displayValue(col.type, value, lang) : shown;

  const onChange = (raw: string) => {
    let v = raw;
    if (isFormula(v)) { setDraft(v); setProblem(''); return; }
    if (col.type === 'date' && /^[tTaA]$/.test(v.trim())) v = A.isoToDisplay(today); // « t » (ou « a ») = aujourd'hui
    if (typed) { const r = A.typeCell(col, v, lang); setDraft(r.display); setProblem(r.problem); } else setDraft(v);
  };
  const finish = () => {
    if (draft === null) return;
    let stored: string | null;
    if (isFormula(draft)) stored = draft;
    else if (typed) {
      const r = A.typeCell(col, draft, lang, true);
      stored = r.stored;
      if (stored === null && draft.trim() !== '') { setProblem(r.problem); (onProblem || ((m: string) => showToast(m, 'error')))(r.problem || (lang === 'en' ? 'Value not accepted.' : 'Valeur refusée.')); }
    } else stored = draft;
    if (stored !== null && stored !== value) { onCommit(stored); setProblem(''); }
    setDraft(null);
  };
  return (
    <>
      <input
        aria-label={ariaLabel || col.name} type="text" readOnly={readOnly} autoFocus={autoFocus} autoComplete="off" autoCorrect="off" spellCheck={false}
        inputMode={kb.inputMode} enterKeyHint={kb.enterKeyHint} list={!typed && col.type !== 'list' ? listId : undefined}
        className={`${className} ${numeric && !editing ? 'text-right' : ''} ${err && !editing ? 'text-red-300 font-semibold' : ''}`}
        value={editing ? (draft as string) : shownText}
        placeholder={placeholder ?? A.placeholderFor(col.type, lang)}
        title={col.type === 'date' ? (lang === 'en' ? 'Type digits only (28102026). “t” = today.' : 'Tape seulement des chiffres (28102026). « t » = aujourd\'hui.') : undefined}
        onFocus={() => { if (!readOnly) { setProblem(''); setDraft(isFormula(value) ? value : typed ? A.displayValue(col.type, value, lang) : value); } }}
        onChange={e => onChange(e.target.value)} onBlur={finish}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(null); setProblem(''); (e.target as HTMLInputElement).blur(); } }}
      />
      {problem && editing && <span role="alert" className="block px-2 pb-1 text-[11px] text-red-300">{problem}</span>}
    </>
  );
};
