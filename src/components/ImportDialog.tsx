import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Download, FileSpreadsheet, X } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import {
  buildPreview, credentialsMatrix, generatePassword, IMPORT_ERROR_TEXT, IMPORT_FIELDS, IMPORT_LIMITS, IMPORT_PROBLEM_TEXT, matrixToCsv, okDrafts,
  sheetFromMatrix, templateMatrix, type ImportKind, type Matrix,
} from '../utils/importRules';
import { downloadCsv, FILE_PROBLEM_TEXT, matrixFromFile } from '../utils/importFile';
import type { Sheet } from '../utils/sheets';
import { MERGE_FAIL_TEXT, MERGE_REASON_TEXT, mergeMatrixIntoSheet } from '../utils/sheetMerge';

// Import Excel et CSV (module 16, M16.1) : choisir un fichier, VOIR l'aperçu ligne par ligne, puis valider. Rien n'est écrit avant « Importer ».
// Les règles sont dans src/utils/importRules.ts ; chaque ligne bonne passe par les mêmes règles que la saisie à la main, le serveur revérifie.
// Réservé au responsable (les pages qui l'ouvrent le sont déjà). Pour les salariés : un mot de passe provisoire est créé par compte et
// montré UNE SEULE FOIS (liste à télécharger) : le site ne le garde nulle part.

const MAX_SHOWN = 150;
const btn = 'min-h-[44px] px-3 rounded-lg border border-slate-700 text-slate-200 text-sm flex items-center justify-center gap-1.5';
const btnMain = 'min-h-[44px] px-4 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold flex items-center justify-center gap-1.5';

const secureRand = (n: number): number => {
  const a = new Uint32Array(1), lim = Math.floor(0x100000000 / n) * n;
  do { crypto.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % n;
};

const TITLE: Record<ImportKind, { fr: string; en: string }> = {
  clients: { fr: 'Importer des clients', en: 'Import clients' },
  products: { fr: 'Importer des produits', en: 'Import products' },
  employees: { fr: 'Importer des salariés', en: 'Import employees' },
  sheet: { fr: 'Importer un tableau', en: 'Import a table' },
};

interface Done { added: number; failed: { label: string; why: string }[]; creds: { username: string; name: string; password: string }[] }

export const ImportDialog: React.FC<{ kind: ImportKind; onClose: () => void; onSheet?: (s: Sheet) => void; storageId?: string; /** M19 : remettre un fichier Excel rempli DANS ce tableau (les lignes sont ajoutées, rien n'est remplacé) */ into?: Sheet; onMerge?: (s: Sheet) => void }> = ({ kind, onClose, onSheet, storageId, into, onMerge }) => {
  const { lang } = useApp();
  const en = lang === 'en';
  const t = (fr: string, e: string) => (en ? e : fr);
  useLockBodyScroll(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  const preview = useMemo(() => {
    if (!matrix || kind === 'sheet') return null;
    const existing = { clients: db.getClients().map(c => c.name), products: db.getProducts().filter(p => !storageId || (p.storage_id || 'main') === storageId).map(p => p.name), usernames: db.getUsers().map(u => u.username) };
    return (buildPreview as any)(kind, matrix, existing) as any;
  }, [matrix, kind]);
  const mergePrev = useMemo(() => (matrix && kind === 'sheet' && into ? mergeMatrixIntoSheet(into, matrix, new Date().toISOString(), en ? 'en' : 'fr') : null), [matrix, kind, into, en]);
  const sheetPrev = useMemo(() => (matrix && kind === 'sheet' && !into ? sheetFromMatrix(matrix, fileName.replace(/\.[^.]+$/, ''), new Date().toISOString()) : null), [matrix, kind, fileName, into]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setProblem(''); setMatrix(null); setDone(null); setFileName(f.name); setBusy(true);
    const r = await matrixFromFile(f);
    setBusy(false);
    if (r.problem) { setProblem((FILE_PROBLEM_TEXT[r.problem] as any)[en ? 'en' : 'fr']); return; }
    setMatrix(r.matrix);
  };

  const template = () => {
    if (kind === 'sheet') return;
    downloadCsv(`modele-${kind}.csv`, matrixToCsv(templateMatrix(kind, en ? 'en' : 'fr')));
  };

  const run = async () => {
    if (!preview || busy) return;
    setBusy(true);
    const failed: Done['failed'] = []; const creds: Done['creds'] = []; let added = 0;
    const why = (code?: string) => (code ? (en ? (IMPORT_ERROR_TEXT as any)[code]?.en : (IMPORT_ERROR_TEXT as any)[code]?.fr) : '') || code || '';
    if (kind === 'clients') {
      for (const d of okDrafts<any>(preview)) { const r = db.addClient(d); if (r.success) added++; else failed.push({ label: d.name, why: why(r.error === 'duplicate' ? 'exists' : r.error) }); }
    } else if (kind === 'products') {
      for (const d of okDrafts<any>(preview)) { const r = db.addProduct(storageId ? { ...d, storage_id: storageId } : d); if (r.success) added++; else failed.push({ label: d.name, why: why(r.error === 'buy' ? 'buy' : r.error === 'sell' ? 'sell' : r.error === 'threshold' ? 'threshold' : r.error) }); }
    } else if (kind === 'employees') {
      for (const d of okDrafts<any>(preview)) {
        const password = generatePassword(secureRand);
        const r = await db.addUser({ username: d.username, name: d.name, phone: d.phone, shift: d.shift, role: 'employee', team: d.team, status: 'active', avatar_url: '', performance_badge: 'Standard' }, password);
        if (r.success) { added++; creds.push({ username: d.username, name: d.name, password }); } else failed.push({ label: d.username, why: r.error || '' });
        await new Promise(res => setTimeout(res, 25)); // l'identifiant interne d'un compte vient de l'heure : on laisse passer quelques millisecondes
      }
    }
    setBusy(false);
    setDone({ added, failed, creds });
  };

  const counts = preview?.counts as { ok: number; error: number; duplicate: number } | undefined;
  const fields = kind === 'sheet' ? [] : IMPORT_FIELDS[kind];
  const rowsShown = (preview?.rows || []).filter((r: any) => r.status !== 'ok').concat((preview?.rows || []).filter((r: any) => r.status === 'ok')).slice(0, MAX_SHOWN);
  const tone = (s: string) => (s === 'ok' ? 'text-emerald-300' : s === 'duplicate' ? 'text-amber-300' : 'text-rose-300');
  const badge = (s: string) => (s === 'ok' ? t('Bon', 'OK') : s === 'duplicate' ? t('Ignoré', 'Skipped') : t('Erreur', 'Error'));

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" onClick={onClose} {...(en ? { 'data-notranslate': '' } : {})}>
      <div className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[#0f1722] border border-slate-700 p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" />{into ? t('Remettre mon fichier Excel', 'Hand in my Excel file') : t(TITLE[kind].fr, TITLE[kind].en)}</h2>
          <button type="button" aria-label={t('Fermer', 'Close')} onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300"><X className="w-5 h-5" /></button>
        </div>

        {!done && (
          <>
            <p className="text-sm text-slate-300">
              {kind === 'sheet' && into
                ? t("Choisis ton fichier Excel rempli (le modèle téléchargé depuis ce tableau). Les lignes sont AJOUTÉES à ton tableau : rien n'est effacé ni remplacé. Tu verras l'aperçu avant.", 'Choose your filled Excel file (the model downloaded from this table). The rows are ADDED to your table: nothing is erased or replaced. You will see a preview first.')
                : kind === 'sheet'
                ? t("Choisis un fichier Excel (.xlsx, .xls) ou CSV. La première ligne donne les noms des colonnes. Tu verras l'aperçu avant que le tableau soit créé.", 'Choose an Excel (.xlsx, .xls) or CSV file. The first row holds the column names. You will see a preview before the table is created.')
                : t("Choisis un fichier Excel (.xlsx, .xls) ou CSV. La première ligne donne les noms des colonnes. Tu verras chaque ligne avant que quoi que ce soit soit enregistré.", 'Choose an Excel (.xlsx, .xls) or CSV file. The first row holds the column names. You will see every row before anything is saved.')}
            </p>
            {kind !== 'sheet' && (
              <div className="text-xs text-slate-400">
                {t('Colonnes reconnues : ', 'Recognised columns: ')}{fields.map(f => `${en ? f.en : f.fr}${f.required ? ' *' : ''}`).join(', ')}. {t('(* obligatoire)', '(* required)')}
                {kind === 'employees' && <> {t("Le rôle n'est jamais lu dans le fichier : tous les comptes créés sont des opérateurs.", 'The role is never read from the file: every account created is an operator.')}</>}
                {kind === 'products' && <> {t('Les quantités en stock ne sont pas importées : ajoute-les ensuite avec des entrées de stock.', 'Stock quantities are not imported: add them afterwards with stock entries.')}</>}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden" onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
              <button type="button" className={btnMain} onClick={() => fileRef.current?.click()} disabled={busy}><FileSpreadsheet className="w-4 h-4" />{t('Choisir un fichier', 'Choose a file')}</button>
              {kind !== 'sheet' && <button type="button" className={btn} onClick={template}><Download className="w-4 h-4" />{t('Télécharger le modèle', 'Download the template')}</button>}
            </div>
            {busy && !matrix && <div className="text-sm text-slate-300">{t('Lecture du fichier…', 'Reading the file…')}</div>}
            {problem && <div className="text-sm text-rose-300 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{problem}</div>}

            {/* Aperçu : clients, produits, salariés */}
            {preview && (
              <div className="space-y-2">
                <div className="text-xs text-slate-400">{fileName}</div>
                {preview.problem
                  ? <div className="text-sm text-rose-300 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{(IMPORT_PROBLEM_TEXT as any)[preview.problem][en ? 'en' : 'fr']}{preview.problem === 'too_many_rows' ? ` (${IMPORT_LIMITS.rows[kind]})` : ''}</div>
                  : <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-slate-900/60 p-2"><div className="text-lg font-bold text-emerald-300">{counts!.ok}</div><div className="text-[11px] text-slate-400">{t('à importer', 'to import')}</div></div>
                      <div className="rounded-lg bg-slate-900/60 p-2"><div className="text-lg font-bold text-amber-300">{counts!.duplicate}</div><div className="text-[11px] text-slate-400">{t('ignorées (déjà là)', 'skipped (already there)')}</div></div>
                      <div className="rounded-lg bg-slate-900/60 p-2"><div className="text-lg font-bold text-rose-300">{counts!.error}</div><div className="text-[11px] text-slate-400">{t('en erreur', 'with errors')}</div></div>
                    </div>
                    {preview.columns && (preview.columns.unknown.length > 0 || preview.columns.repeated.length > 0) && (
                      <div className="text-xs text-amber-300">{t('Colonnes ignorées : ', 'Ignored columns: ')}{[...preview.columns.unknown, ...preview.columns.repeated].join(', ')}</div>
                    )}
                    <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800 max-h-64 overflow-y-auto">
                      {rowsShown.map((r: any) => (
                        <li key={r.line} className="px-3 py-2 text-sm flex gap-2 items-start">
                          <span className="text-xs text-slate-500 w-14 shrink-0">{t('ligne', 'line')} {r.line}</span>
                          <span className="min-w-0 flex-1 text-slate-100 break-words">{r.label || '—'}{r.code && <span className="block text-xs text-slate-400">{(IMPORT_ERROR_TEXT as any)[r.code][en ? 'en' : 'fr']}</span>}</span>
                          <span className={`text-xs font-semibold shrink-0 ${tone(r.status)}`}>{badge(r.status)}</span>
                        </li>
                      ))}
                    </ul>
                    {preview.rows.length > MAX_SHOWN && <div className="text-xs text-slate-400">{t(`Les ${MAX_SHOWN} premières lignes sont montrées (erreurs d'abord). Toutes les lignes bonnes seront importées.`, `The first ${MAX_SHOWN} rows are shown (errors first). Every good row will be imported.`)}</div>}
                    {kind === 'employees' && counts!.ok > 0 && <div className="text-xs text-amber-300">{t("Un mot de passe provisoire sera créé pour chaque compte. Il sera montré une seule fois, à la fin : tu devras le noter ou télécharger la liste.", 'A temporary password will be created for each account. It is shown only once, at the end: you will have to note it or download the list.')}</div>}
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button type="button" className={btn} onClick={onClose}>{t('Annuler', 'Cancel')}</button>
                      <button type="button" className={btnMain} disabled={counts!.ok === 0 || busy} onClick={() => void run()}><Check className="w-4 h-4" />{busy ? t('Import…', 'Importing…') : t(`Importer ${counts!.ok} ligne(s)`, `Import ${counts!.ok} row(s)`)}</button>
                    </div>
                  </>}
              </div>
            )}

            {/* M19 : aperçu avant d'ajouter les lignes du fichier au tableau */}
            {mergePrev && (
              <div className="space-y-2" data-testid="merge-preview">
                <div className="text-xs text-slate-400">{fileName}</div>
                {mergePrev.fail
                  ? <div className="text-sm text-rose-300 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{MERGE_FAIL_TEXT[mergePrev.fail][en ? 'en' : 'fr']}</div>
                  : <>
                    <div className="text-sm text-slate-200">{t(`${mergePrev.added} ligne(s) seront ajoutées. ${mergePrev.matched.length} colonne(s) reconnue(s).`, `${mergePrev.added} row(s) will be added. ${mergePrev.matched.length} column(s) recognised.`)}</div>
                    {mergePrev.ignored.length > 0 && <div className="text-xs text-amber-300">{t('Colonnes du fichier ignorées (elles n\'existent pas dans le tableau) : ', 'File columns ignored (not in the table): ')}{mergePrev.ignored.join(', ')}</div>}
                    {mergePrev.missing.length > 0 && <div className="text-xs text-slate-400">{t('Colonnes du tableau absentes du fichier (laissées vides) : ', 'Table columns missing from the file (left empty): ')}{mergePrev.missing.join(', ')}</div>}
                    {mergePrev.duplicates > 0 && <div className="text-xs text-amber-300">{t(`${mergePrev.duplicates} ligne(s) laissée(s) de côté : la valeur existe déjà dans une colonne « valeur unique ».`, `${mergePrev.duplicates} row(s) left out: the value already exists in a "unique value" column.`)}</div>}
                    {mergePrev.truncated > 0 && <div className="text-xs text-amber-300">{t(`${mergePrev.truncated} ligne(s) en trop (5 000 lignes au maximum) : elles ne seront pas ajoutées.`, `${mergePrev.truncated} extra row(s) (5,000 rows maximum): they will not be added.`)}</div>}
                    {mergePrev.shortened > 0 && <div className="text-xs text-amber-300">{t(`${mergePrev.shortened} case(s) trop longue(s) raccourcie(s) à 500 signes.`, `${mergePrev.shortened} cell(s) shortened to 500 characters.`)}</div>}
                    {mergePrev.problems.length > 0 && (
                      <div className="text-xs text-amber-300 space-y-1">
                        <div className="flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{t(`${mergePrev.problems.length} valeur(s) à corriger après l'ajout (elles sont gardées telles quelles, soulignées en rouge dans le tableau) :`, `${mergePrev.problems.length} value(s) to fix after adding (kept as they are, underlined in red in the table):`)}</div>
                        <ul className="list-disc pl-8 text-slate-300">{mergePrev.problems.slice(0, 8).map((p, i) => <li key={i}>{t('Ligne', 'Row')} {p.row}, {p.column}{p.value ? ` : « ${p.value} »` : ''} : {MERGE_REASON_TEXT[p.reason][en ? 'en' : 'fr']}</li>)}</ul>
                        {mergePrev.problems.length > 8 && <div className="text-slate-400">{t(`… et ${mergePrev.problems.length - 8} autre(s).`, `… and ${mergePrev.problems.length - 8} more.`)}</div>}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button type="button" className={btn} onClick={onClose}>{t('Annuler', 'Cancel')}</button>
                      <button type="button" className={btnMain} disabled={mergePrev.added === 0} onClick={() => { if (mergePrev.sheet && onMerge) { onMerge(mergePrev.sheet); onClose(); } }} data-testid="merge-confirm"><Check className="w-4 h-4" />{t(`Ajouter ${mergePrev.added} ligne(s) à mon tableau`, `Add ${mergePrev.added} row(s) to my table`)}</button>
                    </div>
                  </>}
              </div>
            )}

            {/* Aperçu : tableau libre */}
            {sheetPrev && (
              <div className="space-y-2">
                <div className="text-xs text-slate-400">{fileName}</div>
                {sheetPrev.problem
                  ? <div className="text-sm text-rose-300 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{(IMPORT_PROBLEM_TEXT as any)[sheetPrev.problem][en ? 'en' : 'fr']}</div>
                  : <>
                    <div className="text-sm text-slate-200">{t(`${sheetPrev.rowCount} ligne(s), ${sheetPrev.columns.length} colonne(s).`, `${sheetPrev.rowCount} row(s), ${sheetPrev.columns.length} column(s).`)}</div>
                    <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800 max-h-56 overflow-y-auto">
                      {sheetPrev.columns.map((c, i) => (
                        <li key={i} className="px-3 py-2 text-sm flex justify-between gap-2"><span className="text-slate-100 break-words min-w-0">{c.name}</span><span className="text-xs text-slate-400 shrink-0">{c.type === 'number' ? t('nombre', 'number') : c.type === 'date' ? t('date', 'date') : t('texte', 'text')}</span></li>
                      ))}
                    </ul>
                    {sheetPrev.shortened > 0 && <div className="text-xs text-amber-300">{t(`${sheetPrev.shortened} case(s) trop longue(s) ont été raccourcies à 500 signes.`, `${sheetPrev.shortened} cell(s) were too long and were shortened to 500 characters.`)}</div>}
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button type="button" className={btn} onClick={onClose}>{t('Annuler', 'Cancel')}</button>
                      <button type="button" className={btnMain} onClick={() => { if (sheetPrev.sheet && onSheet) { onSheet(sheetPrev.sheet); onClose(); } }}><Check className="w-4 h-4" />{t('Créer le tableau', 'Create the table')}</button>
                    </div>
                  </>}
              </div>
            )}
          </>
        )}

        {done && (
          <div className="space-y-3">
            <div className="text-sm text-emerald-300 flex gap-2"><Check className="w-4 h-4 shrink-0 mt-0.5" />{t(`${done.added} ligne(s) importée(s).`, `${done.added} row(s) imported.`)}</div>
            {done.failed.length > 0 && (
              <div className="text-sm text-rose-300 space-y-1"><div className="flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{t(`${done.failed.length} ligne(s) refusée(s) :`, `${done.failed.length} row(s) refused:`)}</div>
                <ul className="text-xs text-slate-300 list-disc pl-8">{done.failed.slice(0, 20).map((f, i) => <li key={i}>{f.label} : {f.why}</li>)}</ul></div>
            )}
            {done.creds.length > 0 && (
              <div className="space-y-2 rounded-lg border border-amber-700 bg-amber-950/30 p-3">
                <div className="text-sm text-amber-200">{t("Mots de passe provisoires : ils ne seront plus jamais montrés. Télécharge la liste maintenant et remets chaque mot de passe à son salarié.", 'Temporary passwords: they will never be shown again. Download the list now and hand each password to its employee.')}</div>
                <ul className="text-xs text-slate-200 font-mono space-y-0.5 max-h-40 overflow-y-auto">{done.creds.map(c => <li key={c.username}>{c.username} — {c.password}</li>)}</ul>
                <button type="button" className={btnMain} onClick={() => downloadCsv('mots-de-passe-provisoires.csv', matrixToCsv(credentialsMatrix(done.creds, en ? 'en' : 'fr')))}><Download className="w-4 h-4" />{t('Télécharger la liste', 'Download the list')}</button>
              </div>
            )}
            <div className="flex justify-end"><button type="button" className={btnMain} onClick={onClose}>{t('Fermer', 'Close')}</button></div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
