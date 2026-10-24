import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, ChevronLeft, ChevronRight, Copy, Download, FileSpreadsheet, FileText, Paintbrush, Plus, Redo2, Search, Table2, Trash2, Undo2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { db } from '../db/store';
import { todayMada } from '../utils/stats';
import * as S from '../utils/sheets';
import { FUNCTION_NAMES, isErr, isFormula, showVal } from '../utils/sheetFormula';
import { loadSheets, clearLocal, hasLocal } from '../utils/sheetsStore';
import { downloadExcel, downloadWord, printSheet } from '../utils/sheetExport';
import { showToast } from './ToastHost';
import { ImportDialog } from './ImportDialog';

// « Mes tableaux » (module 12) : saisie type Excel pour l'opérateur. Rangement provisoire sur l'appareil jusqu'à l'étape serveur (M12.4).
let demoSeeded = false; // démo : les exemples ne reviennent pas après avoir été supprimés
const COLOR_CLS: Record<S.CondRule['color'], string> = { red: 'bg-red-500/25 text-red-200', green: 'bg-emerald-500/25 text-emerald-200', amber: 'bg-amber-500/25 text-amber-200', blue: 'bg-sky-500/25 text-sky-200' };
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-600 text-slate-200 text-xs font-semibold hover:bg-slate-700/60 disabled:opacity-40 cursor-pointer';
const inp = 'bg-transparent w-full min-w-0 px-2 py-1.5 text-sm text-slate-100 outline-none focus:bg-sky-500/10';
const box = 'bg-[#0f1722] border rounded-xl border-slate-700 p-3 sm:p-4';

const Cell: React.FC<{ sheet: S.Sheet; row: S.Row; col: S.Column; shown: string; color: S.CondRule['color'] | null; err: boolean; ro: boolean; onCommit: (v: string) => void; t: (a: string, b: string) => string }> = ({ sheet, row, col, shown, color, err, ro, onCommit, t }) => {
  const raw = row.cells[col.id] ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const problem = S.checkCell(sheet, row.id, col.id, raw);
  const msg = problem && { required: t('Obligatoire', 'Required'), duplicate: t('Doublon', 'Duplicate'), number: t('Pas un nombre', 'Not a number'), date: t('Date AAAA-MM-JJ', 'Date YYYY-MM-DD'), list: t('Pas dans la liste', 'Not in the list') }[problem];
  const wrap = `border-r border-b border-slate-700/70 ${color ? COLOR_CLS[color] : ''} ${problem ? 'outline outline-1 outline-red-500/70 -outline-offset-1' : ''}`;
  if (col.type === 'check') return <td className={`${wrap} text-center`}><input type="checkbox" aria-label={col.name} className="w-5 h-5 align-middle" checked={raw === '1'} disabled={ro} onChange={e => onCommit(e.target.checked ? '1' : '')} /></td>;
  if (col.type === 'list' && !isFormula(raw)) return <td className={wrap} title={msg || undefined}><select aria-label={col.name} disabled={ro} className={`${inp} bg-[#0f1722]`} value={raw} onChange={e => onCommit(e.target.value)}><option value="">—</option>{raw && !(col.options || []).includes(raw) && <option value={raw}>{raw}</option>}{(col.options || []).map(o => <option key={o} value={o}>{o}</option>)}</select></td>;
  const editing = draft !== null;
  return (
    <td className={wrap} title={msg || (isFormula(raw) ? raw : undefined)}>
      <input
        aria-label={col.name}
        type="text" readOnly={ro} inputMode={col.type === 'number' && !editing ? 'decimal' : undefined}
        className={`${inp} ${col.type === 'number' && !editing ? 'text-right' : ''} ${err && !editing ? 'text-red-300 font-semibold' : ''}`}
        value={editing ? draft : shown} placeholder={col.type === 'date' ? 'AAAA-MM-JJ' : ''}
        onFocus={() => { if (!ro) setDraft(raw); }} onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== null && draft !== raw) onCommit(draft); setDraft(null); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(raw); (e.target as HTMLInputElement).blur(); } }}
      />
    </td>
  );
};

export const MySheets: React.FC = () => {
  const { lang } = useApp();
  const t = (a: string, b: string) => (lang === 'en' ? b : a);
  const me = db.getCurrentUser();
  const uid = me?.id || '';
  const today = todayMada();
  const nowIso = () => new Date().toISOString();
  const ro = me?.role === 'admin'; // le responsable lit les tableaux de l'équipe, sans rien modifier
  const fromDb = () => db.getSheets().filter(x => ro || x.owner_id === uid);
  const [sheets, setSheets] = useState<S.Sheet[]>(() => {
    const dbl = fromDb();
    if (ro || dbl.length) return dbl;
    const old = hasLocal(uid) ? loadSheets(uid) : []; // tableaux rangés sur l'appareil avant le serveur : on les reprend une fois
    if (old.length) return old;
    return db.isDemo() && !demoSeeded ? S.demoSheets(new Date().toISOString(), lang === 'en' ? 'en' : 'fr') : [];
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [hist, setHist] = useState<S.History | null>(null);
  const [view, setView] = useState<S.View>({});
  const [panel, setPanel] = useState<'' | 'trash' | 'rules' | 'chart' | 'help' | 'export'>('');
  const [colEdit, setColEdit] = useState<string | null>(null);
  const [chartCols, setChartCols] = useState<{ label: string; value: string }>({ label: '', value: '' });
  const [newOpts, setNewOpts] = useState('');
  const [saveOk, setSaveOk] = useState(true);
  const first = useRef(true);
  const openRef = useRef<string | null>(null);
  openRef.current = openId;

  // enregistrement automatique à chaque changement
  useEffect(() => {
    if (ro) return;
    if (first.current) { first.current = false; if (!hasLocal(uid) && !(db.isDemo() && sheets.length && !demoSeeded)) return; }
    db.putMySheets(sheets); demoSeeded = true; clearLocal(uid); setSaveOk(true);
  }, [sheets, uid, ro]);
  // un autre appareil (ou le serveur) a changé quelque chose : on met à jour la liste tant qu'aucun tableau n'est ouvert
  useEffect(() => db.subscribe(() => { if (!openRef.current) { const l = fromDb(); setSheets(p => (JSON.stringify(p) === JSON.stringify(l) ? p : l)); } }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = hist?.present;
  const apply = (fn: (s: S.Sheet) => S.Sheet | null, warn?: string) => {
    if (!hist) return;
    if (ro) return;
    const next = fn(hist.present);
    if (!next) { if (warn) showToast(warn, 'error'); return; }
    if (S.sheetChars(next) > S.SHEET_MAX_CHARS) { showToast(t('Ce tableau est trop gros : supprime des lignes ou divise-le en deux.', 'This table is too big: delete rows or split it in two.'), 'error'); return; }
    const h = S.pushHistory(hist, next); setHist(h);
    setSheets(l => l.map(x => (x.id === next.id ? next : x)));
  };
  const jump = (h: S.History) => { if (ro) return; setHist(h); setSheets(l => l.map(x => (x.id === h.present.id ? h.present : x))); };
  const open = (s: S.Sheet) => { openRef.current = s.id; setOpenId(s.id); setHist(S.newHistory(s)); setView({}); setPanel(''); setColEdit(null); };
  const close = () => { openRef.current = null; setOpenId(null); setHist(null); if (ro) setSheets(fromDb()); };
  const addSheet = (s: S.Sheet) => {
    if (sheets.filter(x => !x.deleted_at).length >= S.LIMITS.sheetsPerPerson) { showToast(t(`${S.LIMITS.sheetsPerPerson} tableaux au maximum : supprime-en un.`, `${S.LIMITS.sheetsPerPerson} tables maximum: delete one.`), 'error'); return; }
    setSheets(l => [...l, s]); open(s);
  };

  const comp = useMemo(() => (cur ? S.computeSheet(cur, today) : null), [cur, today]);
  const shownRows = useMemo(() => (cur && comp ? S.viewRows(cur, comp, view) : []), [cur, comp, view]);
  const totals = useMemo(() => (comp ? S.columnTotals(comp, shownRows) : []), [comp, shownRows]);
  const problems = useMemo(() => (cur ? S.sheetProblems(cur).length : 0), [cur]);

  if (!me || (me.role !== 'employee' && me.role !== 'admin')) return null;

  const list = sheets.filter(s => !s.deleted_at);
  const trashed = sheets.filter(s => s.deleted_at);

  // ---------------- liste ----------------
  if (!cur || !comp) {
    return (
      <div className={`${box} space-y-4 max-w-3xl mx-auto`}>
        {importing && !ro && <ImportDialog kind="sheet" onClose={() => setImporting(false)} onSheet={addSheet} />}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-tactical font-black text-white text-base sm:text-lg flex items-center gap-2"><Table2 className="w-5 h-5" />{ro ? t('Tableaux de l\'équipe', 'Team tables') : t('Mes tableaux', 'My tables')}</h2>
        </div>
        <p className="text-xs text-slate-400">{ro ? t('Tu lis les tableaux de tes opérateurs. Tu ne peux rien y modifier.', 'You read your operators\' tables. You cannot change anything in them.') : t('Entre tes données ici comme dans Excel : les formules marchent (=SOMME(B1:B10)). Télécharge ensuite en Excel, Word ou PDF.', 'Enter your data here like in Excel: formulas work (=SUM(B1:B10)). Then download as Excel, Word or PDF.')}</p>
        {!saveOk && <p className="text-xs text-red-300">{t('Cet appareil refuse l\'enregistrement (plein ou navigation privée). Télécharge ton travail avant de quitter.', 'This device refuses saving (full or private browsing). Download your work before leaving.')}</p>}
        {!ro && <div>
          <p className="text-xs font-semibold text-slate-300 mb-2">{t('Nouveau tableau', 'New table')}</p>
          <div className="flex flex-wrap gap-2">{S.TEMPLATES.map(tp => <button key={tp.id} className={btn} onClick={() => addSheet(S.fromTemplate(tp, '', nowIso(), lang === 'en' ? 'en' : 'fr'))}><Plus className="w-3.5 h-3.5" />{lang === 'en' ? tp.en : tp.fr}</button>)}<button className={btn} onClick={() => setImporting(true)}><FileSpreadsheet className="w-3.5 h-3.5" />{t('Importer (Excel, CSV)', 'Import (Excel, CSV)')}</button></div>
        </div>}
        {list.length === 0 ? <p className="text-sm text-slate-400">{ro ? t('Aucun opérateur n\'a encore de tableau.', 'No operator has a table yet.') : t('Aucun tableau pour le moment.', 'No table yet.')}</p> : (
          <ul className="space-y-2">{list.map(s => (
            <li key={s.id} className="flex items-center gap-2 border border-slate-700 rounded-lg px-3 py-2">
              <button className="flex-1 min-w-0 text-left cursor-pointer" onClick={() => open(s)}>
                <span className="block text-sm font-semibold text-slate-100 truncate">{ro && s.owner_name ? `${s.owner_name} — ` : ''}{s.title}</span>
                <span className="block text-[11px] text-slate-400">{S.activeRows(s).length} {t('ligne(s)', 'row(s)')} · {S.activeColumns(s).length} {t('colonne(s)', 'column(s)')} · {s.updated_at.slice(0, 10)}</span>
              </button>
              {!ro && <button className={btn} aria-label={t('Supprimer', 'Delete')} onClick={() => setSheets(l => l.map(x => (x.id === s.id ? S.deleteSheet(x, nowIso()) : x)))}><Trash2 className="w-3.5 h-3.5" /></button>}
            </li>))}</ul>
        )}
        {!ro && trashed.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-300 mb-2">{t('Corbeille (30 jours)', 'Trash (30 days)')}</p>
            <ul className="space-y-1.5">{trashed.map(s => <li key={s.id} className="flex items-center gap-2 text-xs text-slate-400"><span className="flex-1 truncate">{s.title}</span><button className={btn} onClick={() => setSheets(l => l.map(x => (x.id === s.id ? S.restoreSheet(x, nowIso()) : x)))}>{t('Restaurer', 'Restore')}</button></li>)}</ul>
          </div>
        )}
      </div>
    );
  }

  // ---------------- tableau ouvert ----------------
  const cols = comp.cols, rows = comp.rows;
  const trash = S.trashOf(cur);
  const col = colEdit ? cols.find(c => c.id === colEdit) : undefined;
  const numCols = cols.filter(c => c.type === 'number'), labelCols = cols.filter(c => c.type !== 'number');
  const lc = chartCols.label && cols.some(c => c.id === chartCols.label) ? chartCols.label : labelCols[0]?.id || '';
  const vc = chartCols.value === '' ? '' : cols.some(c => c.id === chartCols.value) ? chartCols.value : '';
  const chart = lc ? S.chartData(comp, lc, vc || undefined) : [];
  const chartMax = Math.max(1, ...chart.map(c => c.value));
  const exportErr = (ok: boolean) => { if (!ok) showToast(t('Fenêtre bloquée : autorise les fenêtres pour ce site.', 'Window blocked: allow pop-ups for this site.'), 'error'); };
  const head = (c: S.Column) => (view.sortCol === c.id ? (view.sortDir === 'desc' ? ' ▼' : ' ▲') : '');

  return (
    <div className={`${box} space-y-3`}>
      <div className="flex items-center gap-2 flex-wrap">
        <button className={btn} onClick={close} aria-label={t('Retour', 'Back')}><ArrowLeft className="w-4 h-4" />{t('Mes tableaux', 'My tables')}</button>
        <input aria-label={t('Titre', 'Title')} className="flex-1 min-w-[140px] bg-transparent border-b border-slate-600 text-white font-bold text-base outline-none px-1 py-1" maxLength={S.LIMITS.title} defaultValue={cur.title} readOnly={ro} key={cur.id} onBlur={e => { if (e.target.value.trim() && e.target.value !== cur.title) apply(s => S.renameSheet(s, e.target.value, nowIso())); }} />
        {!ro && <><button className={btn} disabled={!hist || !hist.past.length} onClick={() => hist && jump(S.undo(hist))} aria-label={t('Annuler', 'Undo')}><Undo2 className="w-4 h-4" /></button>
        <button className={btn} disabled={!hist || !hist.future.length} onClick={() => hist && jump(S.redo(hist))} aria-label={t('Rétablir', 'Redo')}><Redo2 className="w-4 h-4" /></button></>}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {!ro && <button className={btn} onClick={() => apply(s => S.addRow(s, nowIso()), t('5 000 lignes au maximum.', '5,000 rows maximum.'))}><Plus className="w-3.5 h-3.5" />{t('Ligne', 'Row')}</button>}
        {!ro && <button className={btn} onClick={() => { apply(s => S.addColumn(s, t('Colonne', 'Column') + ' ' + (S.activeColumns(s).length + 1), 'text', nowIso()), t('200 colonnes au maximum.', '200 columns maximum.')); }}><Plus className="w-3.5 h-3.5" />{t('Colonne', 'Column')}</button>}
        <div className="relative flex-1 min-w-[120px]"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input aria-label={t('Chercher', 'Search')} className="w-full pl-8 pr-2 py-2 rounded-lg bg-slate-800/60 border border-slate-600 text-xs text-slate-100 outline-none" placeholder={t('Chercher…', 'Search…')} value={view.search || ''} onChange={e => setView(v => ({ ...v, search: e.target.value }))} /></div>
        <button className={btn} onClick={() => setPanel(p => (p === 'chart' ? '' : 'chart'))}><BarChart3 className="w-3.5 h-3.5" />{t('Graphique', 'Chart')}</button>
        {!ro && <button className={btn} onClick={() => setPanel(p => (p === 'rules' ? '' : 'rules'))}><Paintbrush className="w-3.5 h-3.5" />{t('Couleurs', 'Colors')}</button>}
        {!ro && <button className={btn} onClick={() => setPanel(p => (p === 'trash' ? '' : 'trash'))}><Trash2 className="w-3.5 h-3.5" />{t('Corbeille', 'Trash')}{trash.rows.length + trash.columns.length > 0 ? ` (${trash.rows.length + trash.columns.length})` : ''}</button>}
        <button className={btn} onClick={() => setPanel(p => (p === 'help' ? '' : 'help'))}>ƒx</button>
        <button className={btn} onClick={() => setPanel(p => (p === 'export' ? '' : 'export'))}><Download className="w-3.5 h-3.5" />{t('Télécharger', 'Download')}</button>
      </div>

      {panel === 'export' && (
        <div className="flex flex-wrap items-center gap-2 border border-slate-700 rounded-lg p-2.5">
          <button className={btn} onClick={() => { void downloadExcel(cur, today, lang === 'en' ? 'en' : 'fr').catch(() => showToast(t('Export Excel impossible.', 'Excel export failed.'), 'error')); }}>Excel (.xlsx)</button>
          <button className={btn} onClick={() => downloadWord(cur, today, lang === 'en' ? 'en' : 'fr', cur.owner_name || me.name)}><FileText className="w-3.5 h-3.5" />Word (.doc)</button>
          <button className={btn} onClick={() => exportErr(printSheet(cur, today, lang === 'en' ? 'en' : 'fr', cur.owner_name || me.name))}>PDF</button>
          <span className="text-[11px] text-slate-400">{t('Les formules sont téléchargées avec leur résultat.', 'Formulas are downloaded with their result.')}</span>
        </div>
      )}
      {panel === 'help' && (
        <div className="border border-slate-700 rounded-lg p-2.5 text-xs text-slate-300 space-y-1.5">
          <p>{t('Écris une formule dans une case avec « = » : ', 'Write a formula in a cell with “=”: ')}<code className="text-sky-300">=SOMME(B1:B10)</code> · <code className="text-sky-300">=B1*C1</code> · <code className="text-sky-300">=SI(B2&gt;100;"Grand";"Petit")</code></p>
          <p className="text-slate-400">{t('A = 1re colonne, 1 = 1re ligne (les lignes à la corbeille ne comptent pas). Nombres avec un point (1.5). Séparateur « ; » ou « , ».', 'A = 1st column, 1 = 1st row (trashed rows do not count). Numbers with a dot (1.5). Separator “;” or “,”.')}</p>
          <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5">{FUNCTION_NAMES.map(f => <li key={f.fr}><b className="text-slate-100">{lang === 'en' ? f.en : f.fr}</b> — {lang === 'en' ? f.hint.en : f.hint.fr}</li>)}</ul>
        </div>
      )}
      {panel === 'trash' && (
        <div className="border border-slate-700 rounded-lg p-2.5 space-y-1.5 text-xs text-slate-300">
          <p className="text-slate-400">{t('Effacé pour de bon après 30 jours.', 'Erased for good after 30 days.')}</p>
          {trash.rows.length + trash.columns.length === 0 && <p>{t('La corbeille est vide.', 'The trash is empty.')}</p>}
          {trash.columns.map(c => <div key={c.id} className="flex items-center gap-2"><span className="flex-1 truncate">{t('Colonne', 'Column')} « {c.name} »</span><button className={btn} onClick={() => apply(s => S.restoreColumn(s, c.id, nowIso()))}>{t('Restaurer', 'Restore')}</button></div>)}
          {trash.rows.map(r => <div key={r.id} className="flex items-center gap-2"><span className="flex-1 truncate">{t('Ligne', 'Row')} : {Object.values(r.cells).slice(0, 3).join(' · ') || t('(vide)', '(empty)')}</span><button className={btn} onClick={() => apply(s => S.restoreRow(s, r.id, nowIso()))}>{t('Restaurer', 'Restore')}</button></div>)}
        </div>
      )}
      {panel === 'rules' && (
        <div className="border border-slate-700 rounded-lg p-2.5 space-y-2 text-xs text-slate-300">
          <p className="text-slate-400">{t('Colore une case quand elle remplit une condition.', 'Colors a cell when it meets a condition.')}</p>
          {cur.rules.map(r => <div key={r.id} className="flex items-center gap-2"><span className={`px-2 py-0.5 rounded ${COLOR_CLS[r.color]}`}>{cols.find(c => c.id === r.col)?.name || '?'} {r.op === 'empty' ? t('est vide', 'is empty') : `${r.op === 'contains' ? t('contient', 'contains') : r.op} ${r.value}`}</span><button className={btn} aria-label={t('Retirer', 'Remove')} onClick={() => apply(s => S.removeRule(s, r.id, nowIso()))}><X className="w-3.5 h-3.5" /></button></div>)}
          <RuleForm cols={cols} t={t} onAdd={r => apply(s => S.addRule(s, r, nowIso()), t('20 règles au maximum.', '20 rules maximum.'))} />
        </div>
      )}
      {panel === 'chart' && (
        <div className="border border-slate-700 rounded-lg p-2.5 space-y-2 text-xs text-slate-300">
          <div className="flex flex-wrap gap-2 items-center">
            <label>{t('Regrouper par', 'Group by')} <select className="bg-[#0f1722] border border-slate-600 rounded px-2 py-1" value={lc} onChange={e => setChartCols(c => ({ ...c, label: e.target.value }))}>{labelCols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>{t('Valeur', 'Value')} <select className="bg-[#0f1722] border border-slate-600 rounded px-2 py-1" value={vc} onChange={e => setChartCols(c => ({ ...c, value: e.target.value }))}><option value="">{t('Nombre de lignes', 'Row count')}</option>{numCols.map(c => <option key={c.id} value={c.id}>{t('Somme de', 'Sum of')} {c.name}</option>)}</select></label>
          </div>
          {chart.length === 0 ? <p>{t('Rien à montrer.', 'Nothing to show.')}</p> : <ul className="space-y-1">{chart.map(c => <li key={c.label} className="flex items-center gap-2"><span className="w-24 sm:w-32 truncate text-right">{c.label}</span><span className="flex-1 bg-slate-800 rounded h-4"><span className="block h-4 rounded bg-sky-500/70" style={{ width: `${Math.max(2, (Math.max(0, c.value) / chartMax) * 100)}%` }} /></span><span className="w-20 text-right">{showVal(c.value, lang === 'en' ? 'en' : 'fr')}</span></li>)}</ul>}
        </div>
      )}

      {col && (
        <div className="border border-sky-500/50 rounded-lg p-2.5 space-y-2 text-xs text-slate-300">
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label={t('Nom de la colonne', 'Column name')} className="bg-slate-800/60 border border-slate-600 rounded px-2 py-1.5 text-slate-100 w-40" maxLength={S.LIMITS.colName} defaultValue={col.name} key={col.id} onBlur={e => { if (e.target.value.trim() && e.target.value !== col.name) apply(s => S.updateColumn(s, col.id, { name: e.target.value }, nowIso())); }} />
            <select aria-label="Type" className="bg-[#0f1722] border border-slate-600 rounded px-2 py-1.5" value={col.type} onChange={e => apply(s => S.updateColumn(s, col.id, { type: e.target.value as S.ColType }, nowIso()))}>
              <option value="text">{t('Texte', 'Text')}</option><option value="number">{t('Nombre', 'Number')}</option><option value="date">Date</option><option value="list">{t('Liste', 'List')}</option><option value="check">{t('Case à cocher', 'Checkbox')}</option>
            </select>
            <label className="flex items-center gap-1"><input type="checkbox" checked={!!col.required} onChange={e => apply(s => S.updateColumn(s, col.id, { required: e.target.checked }, nowIso()))} />{t('Obligatoire', 'Required')}</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={!!col.unique} onChange={e => apply(s => S.updateColumn(s, col.id, { unique: e.target.checked }, nowIso()))} />{t('Sans doublon', 'No duplicates')}</label>
          </div>
          {col.type === 'list' && <div className="flex items-center gap-2"><input className="flex-1 bg-slate-800/60 border border-slate-600 rounded px-2 py-1.5 text-slate-100" placeholder={t('Choix séparés par une virgule', 'Choices separated by commas')} value={newOpts || (col.options || []).join(', ')} onChange={e => setNewOpts(e.target.value)} /><button className={btn} onClick={() => { apply(s => S.updateColumn(s, col.id, { options: newOpts.split(',') }, nowIso())); setNewOpts(''); }}>OK</button></div>}
          <div className="flex flex-wrap gap-2">
            <button className={btn} onClick={() => setView(v => ({ ...v, sortCol: col.id, sortDir: 'asc' }))}><ArrowUp className="w-3.5 h-3.5" />{t('Trier A→Z', 'Sort A→Z')}</button>
            <button className={btn} onClick={() => setView(v => ({ ...v, sortCol: col.id, sortDir: 'desc' }))}><ArrowDown className="w-3.5 h-3.5" />{t('Trier Z→A', 'Sort Z→A')}</button>
            <button className={btn} onClick={() => setView(v => ({ ...v, sortCol: undefined }))}>{t('Ordre d\'origine', 'Original order')}</button>
            <button className={btn} aria-label={t('Déplacer à gauche', 'Move left')} onClick={() => apply(s => S.moveColumn(s, col.id, -1, nowIso()))}><ChevronLeft className="w-3.5 h-3.5" /></button>
            <button className={btn} aria-label={t('Déplacer à droite', 'Move right')} onClick={() => apply(s => S.moveColumn(s, col.id, 1, nowIso()))}><ChevronRight className="w-3.5 h-3.5" /></button>
            <button className={btn} onClick={() => { apply(s => S.deleteColumn(s, col.id, nowIso())); setColEdit(null); }}><Trash2 className="w-3.5 h-3.5" />{t('Supprimer la colonne', 'Delete column')}</button>
            <button className={btn} onClick={() => setColEdit(null)}>{t('Fermer', 'Close')}</button>
          </div>
        </div>
      )}

      {cols.length === 0 ? <p className="text-sm text-slate-400">{t('Ajoute une colonne pour commencer.', 'Add a column to start.')}</p> : (
        <div className="overflow-auto max-h-[65vh] border border-slate-700 rounded-lg">
          <table className="border-collapse text-sm min-w-full">
            <thead className="sticky top-0 z-10 bg-[#16212e]">
              <tr>
                <th className="w-10 border-r border-b border-slate-700 text-[11px] text-slate-400">#</th>
                {cols.map((c, i) => <th key={c.id} className="border-r border-b border-slate-700 text-left min-w-[120px]"><button className="w-full text-left px-2 py-1.5 text-xs font-bold text-slate-200 cursor-pointer hover:bg-slate-700/50" onClick={() => (ro ? setView(v => ({ ...v, sortCol: c.id, sortDir: v.sortCol === c.id && v.sortDir !== 'desc' ? 'desc' : 'asc' })) : setColEdit(colEdit === c.id ? null : c.id))} title={ro ? t('Trier', 'Sort') : t('Réglages de la colonne', 'Column settings')}><span className="text-slate-500 mr-1">{S.activeColumns(cur).length > 0 ? colName(i) : ''}</span>{c.name}{head(c)}</button></th>)}
                {!ro && <th className="w-20 border-b border-slate-700" />}
              </tr>
            </thead>
            <tbody>
              {shownRows.map(ri => {
                const row = rows[ri];
                return (
                  <tr key={row.id}>
                    <td className="border-r border-b border-slate-700/70 text-center text-[11px] text-slate-500">{ri + 1}</td>
                    {cols.map((c, ci) => { const v = comp.grid[ri][ci]; return <Cell key={c.id} sheet={cur} row={row} col={c} t={t} err={isErr(v)} ro={ro} shown={showCell(v, c, lang)} color={S.ruleColor(cur, comp, ri, ci)} onCommit={val => apply(s => S.updateCell(s, row.id, c.id, val, nowIso()))} />; })}
                    {!ro && <td className="border-b border-slate-700/70 whitespace-nowrap">
                      <button className="p-1.5 text-slate-400 hover:text-sky-300 cursor-pointer" aria-label={t('Dupliquer la ligne', 'Duplicate row')} onClick={() => apply(s => S.duplicateRow(s, row.id, nowIso()), t('5 000 lignes au maximum.', '5,000 rows maximum.'))}><Copy className="w-3.5 h-3.5" /></button>
                      <button className="p-1.5 text-slate-400 hover:text-red-300 cursor-pointer" aria-label={t('Supprimer la ligne', 'Delete row')} onClick={() => apply(s => S.deleteRow(s, row.id, nowIso()))}><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>}
                  </tr>
                );
              })}
            </tbody>
            {totals.length > 0 && (
              <tfoot className="sticky bottom-0 bg-[#16212e]">
                <tr><td className="border-r border-t border-slate-700 text-[11px] text-slate-400 text-center">Σ</td>{cols.map(c => { const tt = totals.find(x => x.col === c.id); return <td key={c.id} className="border-r border-t border-slate-700 px-2 py-1 text-xs text-right text-slate-200" title={tt ? `${t('Moyenne', 'Average')} ${tt.avg === null ? '—' : showVal(tt.avg, lang === 'en' ? 'en' : 'fr')} · min ${tt.min ?? '—'} · max ${tt.max ?? '—'}` : undefined}>{tt ? showVal(tt.sum, lang === 'en' ? 'en' : 'fr') : ''}</td>; })}{!ro && <td className="border-t border-slate-700" />}</tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        {shownRows.length}/{rows.length} {t('ligne(s)', 'row(s)')}{problems > 0 ? ` · ${problems} ${t('case(s) à corriger', 'cell(s) to fix')}` : ''}
        {ro ? ` · ${cur.owner_name || ''} · ${t('lecture seule', 'read only')}` : saveOk ? ` · ${t('enregistré', 'saved')}` : ` · ${t('ENREGISTREMENT IMPOSSIBLE : télécharge ton travail', 'SAVING FAILED: download your work')}`}
      </p>
    </div>
  );
};

const colName = (i: number) => { let s = ''; for (let x = i + 1; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };
function showCell(v: ReturnType<typeof S.computeSheet>['grid'][number][number], c: S.Column, lang: string): string {
  if (c.type === 'check') return '';
  if (typeof v === 'string') return v;
  return showVal(v, lang === 'en' ? 'en' : 'fr');
}

const RuleForm: React.FC<{ cols: S.Column[]; t: (a: string, b: string) => string; onAdd: (r: Omit<S.CondRule, 'id'>) => void }> = ({ cols, t, onAdd }) => {
  const [r, setR] = useState<Omit<S.CondRule, 'id'>>({ col: cols[0]?.id || '', op: '>', value: '', color: 'red' });
  const sel = 'bg-[#0f1722] border border-slate-600 rounded px-2 py-1.5';
  if (!cols.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label={t('Colonne', 'Column')} className={sel} value={cols.some(c => c.id === r.col) ? r.col : cols[0].id} onChange={e => setR({ ...r, col: e.target.value })}>{cols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select aria-label={t('Condition', 'Condition')} className={sel} value={r.op} onChange={e => setR({ ...r, op: e.target.value as S.CondRule['op'] })}><option value=">">{'>'}</option><option value="<">{'<'}</option><option value="=">=</option><option value="<>">≠</option><option value="contains">{t('contient', 'contains')}</option><option value="empty">{t('est vide', 'is empty')}</option></select>
      {r.op !== 'empty' && <input aria-label={t('Valeur', 'Value')} className={`${sel} w-24`} value={r.value} onChange={e => setR({ ...r, value: e.target.value })} />}
      <select aria-label={t('Couleur', 'Color')} className={sel} value={r.color} onChange={e => setR({ ...r, color: e.target.value as S.CondRule['color'] })}><option value="red">{t('Rouge', 'Red')}</option><option value="green">{t('Vert', 'Green')}</option><option value="amber">{t('Orange', 'Amber')}</option><option value="blue">{t('Bleu', 'Blue')}</option></select>
      <button className={btn} onClick={() => onAdd({ ...r, col: cols.some(c => c.id === r.col) ? r.col : cols[0].id })}><Plus className="w-3.5 h-3.5" />{t('Ajouter', 'Add')}</button>
    </div>
  );
};
