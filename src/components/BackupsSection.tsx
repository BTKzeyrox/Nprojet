import React, { useCallback, useEffect, useState } from 'react';
import { Database, Download, RefreshCw, RotateCcw } from 'lucide-react';
import { db } from '../db/store';
import { askConfirm } from './ConfirmModal';
import { checkBackupFile, EXPORT_ERROR_TEXT, EXPORT_LIMITS, exportFileName } from '../utils/exportFile';

type Row = { id: number; taken_at: string; tables: number; bytes: number };

const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);

/** Sauvegardes de nuit : liste, sauvegarde immédiate, téléchargement (JSON), restauration (M7.3 : Gmail vérifié, mot RESTAURER, confirmation, code par mail, sauvegarde de sécurité automatique). */
export const BackupsSection: React.FC = () => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [verified, setVerified] = useState(false);
  const [target, setTarget] = useState<Row | null>(null);
  const [step, setStep] = useState<'warn' | 'code'>('warn');
  const [word, setWord] = useState('');
  const [code, setCode] = useState('');

  const load = useCallback(async () => {
    const r = await db.listBackups();
    if (r.ok) setRows(r.rows);
    else { setRows([]); setMsg({ text: r.error || 'Erreur.', ok: false }); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void db.restoreStatus().then(r => setVerified(!!(r.ok && r.data?.verified))); }, []);

  const closeRestore = () => { setTarget(null); setStep('warn'); setWord(''); setCode(''); };
  const askCode = async () => {
    setBusy(true); setMsg(null);
    const r = await db.restoreBackupCode();
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error || 'Erreur.', ok: false });
    setStep('code'); setMsg({ text: 'Code envoyé sur votre Gmail.', ok: true });
  };
  const runRestore = async () => {
    if (!target) return;
    setBusy(true); setMsg(null);
    const r = await db.restoreBackupExecute(target.id, code);
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.error || 'La restauration a échoué.', ok: false });
    closeRestore();
    setMsg({ text: 'Sauvegarde restaurée. Une sauvegarde de sécurité a été prise juste avant. Rechargement…', ok: true });
    setTimeout(() => window.location.reload(), 1500);
  };

  const now = async () => {
    setBusy(true); setMsg(null);
    const r = await db.backupNow();
    if (r.ok) { setMsg({ text: 'Sauvegarde faite.', ok: true }); await load(); }
    else setMsg({ text: r.error || 'La sauvegarde a échoué.', ok: false });
    setBusy(false);
  };

  // M16.5 : « Exporter toutes les données » = une sauvegarde toute fraîche, téléchargée en un clic (même fichier que « Télécharger »).
  const exportAll = async () => {
    setBusy(true); setMsg(null);
    const made = await db.backupNow(); // refus « une sauvegarde vient d'être faite » : on prend alors la plus récente
    const list = await db.listBackups();
    const row = list.ok ? list.rows[0] : undefined;
    if (!row || (!made.ok && Date.now() - new Date(row.taken_at).getTime() > 5 * 60_000)) { setBusy(false); return setMsg({ text: made.error || list.error || 'Export impossible.', ok: false }); }
    const r = await db.getBackup(row.id);
    setBusy(false);
    if (!r.ok || !r.backup) return setMsg({ text: r.error || 'Export impossible.', ok: false });
    const blob = new Blob([JSON.stringify(r.backup.data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = exportFileName(new Date());
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg({ text: 'Export téléchargé. Gardez-le comme un mot de passe : il contient tous les comptes.', ok: true });
    await load();
  };
  // M16.5 : « Importer un fichier d'export » : contrôlé ici puis par le serveur ; ajouté à la liste, rien n'est remplacé.
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setMsg(null);
    if (file.size > EXPORT_LIMITS.fileBytes) return setMsg({ text: EXPORT_ERROR_TEXT.too_big, ok: false });
    let parsed: unknown;
    try { parsed = JSON.parse(await file.text()); } catch { return setMsg({ text: EXPORT_ERROR_TEXT.not_json, ok: false }); }
    const c = checkBackupFile(parsed);
    if (!c.ok) return setMsg({ text: EXPORT_ERROR_TEXT[c.error || 'not_object'] || EXPORT_ERROR_TEXT.not_object, ok: false });
    askConfirm({ title: 'Ajouter ce fichier ?', message: `${c.tables.length} tables, ${c.totalRows} lignes. Il sera ajouté à la liste des sauvegardes. Rien n'est remplacé : pour l'utiliser, appuyez ensuite sur « Restaurer ».`, confirmLabel: 'Ajouter', onConfirm: async () => {
      setBusy(true);
      const r = await db.backupImport(parsed);
      setBusy(false);
      if (!r.ok) return setMsg({ text: (r.code && EXPORT_ERROR_TEXT[r.code]) || r.error || 'Fichier refusé.', ok: false });
      setMsg({ text: 'Fichier ajouté à la liste. Rien n\'a été remplacé. Gardé 14 jours comme les autres sauvegardes.', ok: true });
      await load();
    } });
  };

  const download = async (row: Row) => {
    setDownloading(row.id); setMsg(null);
    const r = await db.getBackup(row.id);
    setDownloading(null);
    if (!r.ok || !r.backup) return setMsg({ text: r.error || 'Téléchargement impossible.', ok: false });
    const blob = new Blob([JSON.stringify(r.backup.data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date(row.taken_at);
    const pad = (n: number) => String(n).padStart(2, '0');
    a.href = url;
    a.download = `sauvegarde-gestion-pro-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg({ text: 'Sauvegarde téléchargée.', ok: true });
  };

  const last = rows && rows[0];
  const old = !!last && Date.now() - new Date(last.taken_at).getTime() > 26 * 3600 * 1000;

  return (
    <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl">
      <h3 className="font-tactical font-bold text-white flex items-center gap-2">
        <Database className="w-4 h-4 text-emerald-400" /> Sauvegardes automatiques
      </h3>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        Une sauvegarde est faite chaque nuit. Les 14 derniers jours sont gardés. Les photos et les fichiers n'y sont pas : ils restent sur Cloudinary.
      </p>
      <p className="text-[11px] text-amber-300 leading-relaxed">
        Le fichier contient les mots de passe chiffrés des comptes. Ne le partagez pas.
      </p>

      {rows === null && <div className="text-sm text-slate-400">Chargement…</div>}
      {rows !== null && rows.length === 0 && <div className="text-sm text-slate-300">Aucune sauvegarde pour le moment.</div>}
      {last && (
        <div className={`text-sm ${old ? 'text-amber-300' : 'text-emerald-300'}`}>
          Dernière sauvegarde : {fmtDate(last.taken_at)}
          {old && <div className="text-xs mt-1">Attention : elle a plus de 24 h.</div>}
        </div>
      )}

      <button type="button" disabled={busy} onClick={now} className="w-full min-h-[46px] px-4 rounded-full bg-emerald-900/50 hover:bg-emerald-800 border border-emerald-700 text-emerald-200 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
        <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Sauvegarder maintenant
      </button>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={exportAll} className="min-h-[46px] px-4 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"><Download className="w-4 h-4" /> Exporter toutes les données</button>
        {<label className={`min-h-[46px] px-4 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}><Database className="w-4 h-4" /> Importer un fichier d'export<input type="file" accept=".json,application/json" className="sr-only" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /></label>}
      </div>

      {rows && rows.length > 0 && (
        <ul className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
          {rows.map(r => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm text-white">{fmtDate(r.taken_at)}</div>
                <div className="text-[11px] text-slate-400">{fmtSize(r.bytes)}</div>
              </div>
              <button type="button" disabled={downloading === r.id} onClick={() => download(r)} className="shrink-0 px-3 py-2 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
                <Download className="w-3.5 h-3.5" /> Télécharger
              </button>
              <button type="button" disabled={!verified || busy} onClick={() => { setTarget(r); setStep('warn'); setWord(''); setCode(''); setMsg(null); }} className="shrink-0 px-3 py-2 rounded-full bg-red-950/70 hover:bg-red-900 border border-red-700 text-red-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                <RotateCcw className="w-3.5 h-3.5" /> Restaurer
              </button>
            </li>
          ))}
        </ul>
      )}

      {!verified && <p className="text-[11px] text-amber-300">Pour restaurer, enregistrez et vérifiez votre Gmail dans « Restauration du site » plus bas.</p>}
      {target && (
        <div className="border border-red-700 bg-red-950/30 p-3 space-y-2 rounded-xl">
          <p className="text-xs text-red-200 font-bold">Restaurer la sauvegarde du {fmtDate(target.taken_at)}</p>
          {step === 'warn' && (
            <>
              <p className="text-[11px] text-slate-300">Les données actuelles seront remplacées par celles de cette sauvegarde (comptes, missions, finances, factures, stock…). Ce qui a été fait depuis sera perdu. Le journal d'audit est gardé. Une sauvegarde de sécurité est prise juste avant. Écrivez <b>RESTAURER</b> pour continuer.</p>
              <input value={word} onChange={e => setWord(e.target.value)} placeholder="RESTAURER" autoCapitalize="characters" className="w-full bg-[#0d1622] border border-slate-600 p-2.5 text-white text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={closeRestore} className="min-h-[44px] px-3 text-xs font-bold bg-slate-800 border border-slate-600 text-slate-200 cursor-pointer">Annuler</button>
                <button type="button" disabled={word.trim() !== 'RESTAURER' || busy} onClick={() => askConfirm({ title: 'Dernière chance', message: 'Confirmation 2 sur 2 : les données actuelles seront remplacées par cette sauvegarde. Un code va être envoyé sur votre Gmail.', confirmLabel: 'Oui, envoyer le code', danger: true, onConfirm: askCode })} className="min-h-[44px] px-3 text-xs font-bold bg-red-700 hover:bg-red-600 text-white disabled:opacity-50 cursor-pointer">Continuer</button>
              </div>
            </>
          )}
          {step === 'code' && (
            <>
              <p className="text-[11px] text-slate-300">Entrez le code à 6 chiffres reçu par mail. Il est valable 10 minutes.</p>
              <input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="Code à 6 chiffres" className="w-full bg-[#0d1622] border border-slate-600 p-2.5 text-white text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={closeRestore} className="min-h-[44px] px-3 text-xs font-bold bg-slate-800 border border-slate-600 text-slate-200 cursor-pointer">Annuler</button>
                <button type="button" disabled={code.length !== 6 || busy} onClick={runRestore} className="min-h-[44px] px-3 text-xs font-bold bg-red-700 hover:bg-red-600 text-white disabled:opacity-50 cursor-pointer">Restaurer</button>
              </div>
            </>
          )}
        </div>
      )}
      {msg && <div className={`text-sm ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</div>}
    </section>
  );
};
