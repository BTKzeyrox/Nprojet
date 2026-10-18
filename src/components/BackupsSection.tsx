import React, { useCallback, useEffect, useState } from 'react';
import { Database, Download, RefreshCw } from 'lucide-react';
import { db } from '../db/store';

type Row = { id: number; taken_at: string; tables: number; bytes: number };

const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);

/** Sauvegardes de nuit : liste, sauvegarde immédiate, téléchargement (JSON). La restauration n'est pas encore là. */
export const BackupsSection: React.FC = () => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const r = await db.listBackups();
    if (r.ok) setRows(r.rows);
    else { setRows([]); setMsg({ text: r.error || 'Erreur.', ok: false }); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const now = async () => {
    setBusy(true); setMsg(null);
    const r = await db.backupNow();
    if (r.ok) { setMsg({ text: 'Sauvegarde faite.', ok: true }); await load(); }
    else setMsg({ text: r.error || 'La sauvegarde a échoué.', ok: false });
    setBusy(false);
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

      {rows && rows.length > 0 && (
        <ul className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
          {rows.map(r => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm text-white">{fmtDate(r.taken_at)}</div>
                <div className="text-[11px] text-slate-400">{fmtSize(r.bytes)}</div>
              </div>
              <button type="button" disabled={downloading === r.id} onClick={() => download(r)} className="shrink-0 px-3 py-2 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
                <Download className="w-3.5 h-3.5" /> Télécharger
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-slate-500">La restauration depuis une sauvegarde n'est pas encore disponible.</p>
      {msg && <div className={`text-sm ${msg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</div>}
    </section>
  );
};
