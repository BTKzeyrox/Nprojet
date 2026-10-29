import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Plus, Search, Trash2 } from 'lucide-react';
import * as S from '../utils/sheets';
import * as A from '../utils/sheetAuto';
import { isErr, isFormula, showVal } from '../utils/sheetFormula';
import { SmartField } from './SmartField';

// Vue « Formulaire » d'un tableau (module 19, M19.4) : UNE fiche par ligne, champs étiquetés, lisible sur téléphone.
// Mêmes données que la grille (on passe de l'une à l'autre sans rien perdre) ; mêmes champs intelligents (SmartField) ; mêmes règles (annuler, corbeille, limites).
const btn = 'inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-slate-600 text-slate-200 text-xs font-semibold hover:bg-slate-700/60 disabled:opacity-40 cursor-pointer';
const fld = 'w-full min-w-0 bg-[#0b1220] border border-slate-600 rounded-lg px-3 py-2.5 text-base text-slate-100 outline-none focus:border-sky-500';

/** Résumé d'une fiche pour la liste : les 3 premières valeurs remplies, mises en forme (date jj/mm/aaaa, milliers). */
export function rowSummary(sheet: S.Sheet, row: S.Row, lang: A.Lang): string {
  const out: string[] = [];
  for (const c of S.activeColumns(sheet)) {
    const v = (row.cells[c.id] ?? '').trim();
    if (!v || c.type === 'check') continue;
    out.push(A.displayValue(c.type, v, lang));
    if (out.length === 3) break;
  }
  return out.join(' · ');
}
/** Les fiches qui correspondent à la recherche (n'importe quelle valeur, sans accents ni majuscules). */
export function formRows(sheet: S.Sheet, search: string): S.Row[] {
  const q = search.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const rows = S.activeRows(sheet);
  if (!q) return rows;
  return rows.filter(r => Object.values(r.cells).some(v => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)));
}

export const SheetForm: React.FC<{
  sheet: S.Sheet; comp: S.Computed; ro: boolean; lang: A.Lang; today: string;
  apply: (fn: (s: S.Sheet) => S.Sheet | null, warn?: string) => S.Sheet | null;
  t: (fr: string, en: string) => string; now: () => string;
}> = ({ sheet, comp, ro, lang, today, apply, t, now }) => {
  const [rowId, setRowId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const list = useMemo(() => formRows(sheet, search), [sheet, search]);
  const cols = comp.cols;
  const cur = list.find(r => r.id === rowId) || list[0] || null;
  const pos = cur ? list.findIndex(r => r.id === cur.id) : -1;
  useEffect(() => { if (cur && cur.id !== rowId) setRowId(cur.id); }, [cur, rowId]);
  const gridIndex = cur ? comp.rows.findIndex(r => r.id === cur.id) : -1;
  const go = (d: -1 | 1) => { const n = list[pos + d]; if (n) setRowId(n.id); };

  const add = () => { const nx = apply(s => A.addRowAuto(s, now(), today), t('5 000 lignes au maximum.', '5,000 rows maximum.')); if (nx) { const act = S.activeRows(nx); setSearch(''); setRowId(act[act.length - 1]?.id || null); } };
  const dup = () => { if (!cur) return; const nx = apply(s => S.duplicateRow(s, cur.id, now()), t('5 000 lignes au maximum.', '5,000 rows maximum.')); if (nx) { const act = S.activeRows(nx); setRowId(act[act.length - 1]?.id || null); } };
  const del = () => { if (!cur) return; const next = list[pos + 1] || list[pos - 1] || null; if (apply(s => S.deleteRow(s, cur.id, now()))) setRowId(next ? next.id : null); };

  // « Entrée » passe au champ suivant (clavier du téléphone : « Suivant »)
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (e.key !== 'Enter' || el.tagName !== 'INPUT' || (el as HTMLInputElement).type === 'checkbox' || !box.current) return;
    const all = Array.from(box.current.querySelectorAll<HTMLElement>('input:not([readonly]):not([type=search]), select'));
    const i = all.indexOf(el);
    if (i >= 0 && all[i + 1]) setTimeout(() => all[i + 1].focus(), 0);
  };

  const field = (c: S.Column) => {
    if (!cur) return null;
    const raw = cur.cells[c.id] ?? '';
    const v = gridIndex >= 0 ? comp.grid[gridIndex][cols.findIndex(k => k.id === c.id)] : null;
    const shown = typeof v === 'string' ? v : showVal(v, lang);
    const problem = S.checkCell(sheet, cur.id, c.id, raw);
    const msg = problem && { required: t('Obligatoire', 'Required'), duplicate: t('Cette valeur existe déjà', 'This value already exists'), number: t('Pas un nombre', 'Not a number'), date: t('Date invalide (jj/mm/aaaa)', 'Invalid date (dd/mm/yyyy)'), list: t('Pas dans la liste', 'Not in the list'), time: t('Heure invalide (hh:mm)', 'Invalid time (hh:mm)'), phone: t('Numéro invalide', 'Invalid number') }[problem];
    const commit = (val: string) => apply(s => S.updateCell(s, cur.id, c.id, val, now()));
    let input: React.ReactNode;
    if (c.type === 'check') input = <input type="checkbox" aria-label={c.name} className="w-7 h-7" checked={raw === '1'} disabled={ro} onChange={e => commit(e.target.checked ? '1' : '')} />;
    else if (c.type === 'list' && !isFormula(raw)) input = <select aria-label={c.name} disabled={ro} className={fld} value={raw} onChange={e => commit(e.target.value)}><option value="">—</option>{raw && !(c.options || []).includes(raw) && <option value={raw}>{raw}</option>}{(c.options || []).map(o => <option key={o} value={o}>{o}</option>)}</select>;
    else input = <SmartField col={c} value={raw} shown={shown} lang={lang} today={today} readOnly={ro} err={isErr(v)} className={fld} listId={`dlf-${sheet.id}-${c.id}`} onCommit={commit} />;
    return (
      <div key={c.id} className="space-y-1" data-testid="form-field">
        <label className="block text-xs font-semibold text-slate-300">{c.name}{c.required ? <span className="text-red-400"> *</span> : null}{c.type === 'date' && !ro ? <button type="button" className="ml-2 text-sky-300 underline font-normal" onClick={() => commit(today)}>{t('aujourd\'hui', 'today')}</button> : null}</label>
        {input}
        {isFormula(raw) && <p className="text-[11px] text-slate-400">{raw}</p>}
        {msg && <p className="text-[11px] text-red-300" role="alert">{msg}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-3" data-testid="sheet-form">
      {cols.filter(c => c.type === 'text').map(c => <datalist key={c.id} id={`dlf-${sheet.id}-${c.id}`}>{A.columnSuggestions(sheet, c.id).map(v => <option key={v} value={v} />)}</datalist>)}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[140px]"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" aria-label={t('Chercher une fiche', 'Search a record')} className="w-full pl-8 pr-2 py-2.5 rounded-lg bg-slate-800/60 border border-slate-600 text-sm text-slate-100 outline-none" placeholder={t('Chercher une fiche', 'Search a record')} value={search} onChange={e => setSearch(e.target.value)} /></div>
        {!ro && <button className={btn} onClick={add}><Plus className="w-4 h-4" />{t('Ajouter', 'Add')}</button>}
      </div>

      {cols.length === 0 ? <p className="text-sm text-slate-400">{t('Ajoute une colonne (vue Grille) pour commencer.', 'Add a column (Grid view) to start.')}</p>
        : !cur ? <p className="text-sm text-slate-400">{search ? t('Aucune fiche ne correspond.', 'No record matches.') : t('Aucune fiche pour le moment.', 'No record yet.')}{!ro && !search ? ` ${t('Appuie sur « Ajouter ».', 'Press “Add”.')}` : ''}</p> : (
          <div className="grid gap-3 md:grid-cols-[minmax(0,260px)_1fr]">
            <ul className="order-2 md:order-1 space-y-1.5 max-h-[50vh] md:max-h-[65vh] overflow-auto" aria-label={t('Liste des fiches', 'Records list')}>
              {list.map(r => (
                <li key={r.id}><button type="button" onClick={() => setRowId(r.id)} className={`w-full text-left rounded-lg border px-3 py-2 cursor-pointer ${r.id === cur.id ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700 hover:bg-slate-700/40'}`} data-testid="form-card">
                  <span className="block text-[11px] text-slate-400">{t('Fiche', 'Record')} {comp.rows.findIndex(x => x.id === r.id) + 1}</span>
                  <span className="block text-sm text-slate-100 truncate">{rowSummary(sheet, r, lang) || t('(vide)', '(empty)')}</span>
                </button></li>
              ))}
            </ul>
            <div className="order-1 md:order-2 border border-slate-700 rounded-xl p-3 sm:p-4 space-y-3" ref={box} onKeyDown={onKey}>
              <div className="flex items-center gap-2 flex-wrap">
                <button className={btn} disabled={pos <= 0} onClick={() => go(-1)} aria-label={t('Fiche précédente', 'Previous record')}><ChevronLeft className="w-4 h-4" />{t('Précédent', 'Previous')}</button>
                <span className="text-xs text-slate-300 flex-1 text-center" data-testid="form-position">{t('Fiche', 'Record')} {pos + 1} / {list.length}</span>
                <button className={btn} disabled={pos >= list.length - 1} onClick={() => go(1)} aria-label={t('Fiche suivante', 'Next record')}>{t('Suivant', 'Next')}<ChevronRight className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3">{cols.map(field)}</div>
              {!ro && <div className="flex flex-wrap gap-2 pt-1">
                <button className={btn} onClick={dup}><Copy className="w-4 h-4" />{t('Dupliquer', 'Duplicate')}</button>
                <button className={`${btn} border-red-500/50 text-red-300`} onClick={del}><Trash2 className="w-4 h-4" />{t('Supprimer la fiche', 'Delete the record')}</button>
                <span className="text-[11px] text-slate-500 self-center">{t('Enregistré automatiquement. Supprimé = corbeille 30 jours.', 'Saved automatically. Deleted = trash for 30 days.')}</span>
              </div>}
            </div>
          </div>
        )}
    </div>
  );
};
