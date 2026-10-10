import React, { useEffect, useState } from 'react';
import { Hourglass } from 'lucide-react';
import { db } from '../db/store';
import { hasOpenPost } from '../utils/presence';

// Booster : « Je n'ai pas de poste » -> entre dans la file d'attente vue par l'admin
export const QueueButton: React.FC<{ userId: string }> = ({ userId }) => {
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  useEffect(() => { const t = setInterval(() => force(n => n + 1), 30000); return () => clearInterval(t); }, []);

  if (hasOpenPost(userId, db.getPosts())) return null; // une session en cours : pas besoin de la file
  const q = db.getMyQueue();
  const minutes = q ? Math.max(0, Math.floor((Date.now() - new Date(q.waiting_since).getTime()) / 60000)) : 0;

  const toggle = async () => {
    setBusy(true); setErr('');
    const r = await db.setWaiting(!q);
    if (!r.success) setErr(r.error || 'Action impossible.');
    setBusy(false);
  };

  return (
    <div className="flex items-center justify-between gap-3 bg-[#0f1722] p-3 rounded-xl border border-slate-800">
      <div className="flex items-center gap-2.5 min-w-0">
        <Hourglass className={`w-5 h-5 shrink-0 ${q ? 'text-amber-400' : 'text-slate-400'}`} />
        <div className="min-w-0 text-xs font-mono">
          {q ? (
            <>
              <div className="text-amber-300 font-bold">File d'attente : tu es n°{q.position} sur {q.total}</div>
              <div className="text-slate-400">En attente depuis {minutes} min. On te prévient quand un poste se libère.</div>
            </>
          ) : (
            <div className="text-slate-300">Pas de poste libre ? Prévenez l'admin.</div>
          )}
          {err && <div className="text-red-400 mt-0.5">{err}</div>}
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={toggle}
        className={`shrink-0 px-3 py-2 text-xs font-bold border cursor-pointer disabled:opacity-50 ${q ? 'bg-[#141e2a] border-slate-600 text-slate-200' : 'bg-amber-600 hover:bg-amber-500 border-amber-500 text-white'}`}
      >
        {q ? 'Quitter la file' : "Je n'ai pas de poste"}
      </button>
    </div>
  );
};
