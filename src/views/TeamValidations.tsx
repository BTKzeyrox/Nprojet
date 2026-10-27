import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { db } from '../db/store';
import type { PostSession, User } from '../types';
import { teamPendingPosts } from '../utils/teamLead';

type Lightbox = (p: { imageUrl: string; gallery?: string[]; title: string; subtitle?: string; score?: number; clientTag?: string; operatorName?: string; timestamp?: string }) => void;

/** Validations de l'équipe (Chef d'équipe) : début et fin de session des opérateurs de son équipe. Aucun montant n'est affiché : la paie et le prix client sont calculés par le serveur. */
export const TeamValidations: React.FC<{ currentUser: User; onOpenProofLightbox: Lightbox }> = ({ currentUser, onOpenProofLightbox }) => {
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [refusing, setRefusing] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const me = db.getCurrentUser() || currentUser;
  const users = db.getUsers();
  const list = useMemo(() => teamPendingPosts(me, users, db.getPosts()), [me, users, db.getPosts()]); // eslint-disable-line react-hooks/exhaustive-deps
  const team = (me.team || '').trim();

  const decide = async (p: PostSession, approve: boolean) => {
    setError('');
    setBusy(p.id);
    // La ligne disparaît tout de suite ; le vrai résultat du serveur arrive ensuite (si refus ou réseau tombé : la ligne revient avec un message).
    const now = db.decidePostNow(p.id, approve, approve ? undefined : reason);
    if (!now.ok) { setBusy(''); setError(now.error || 'Erreur.'); return; }
    setRefusing(null);
    setReason('');
    const r = await now.settled;
    setBusy('');
    if (!r.ok) setError(`${approve ? 'La validation' : 'Le refus'} n'a pas été enregistré${approve ? 'e' : ''} : ${r.error || 'erreur'}. La session est revenue en attente.`);
  };

  const proofs = (p: PostSession) => (p.status === 'pending_end' ? (p.end_proof_urls?.length ? p.end_proof_urls : p.end_proof_url ? [p.end_proof_url] : []) : (p.start_proof_urls?.length ? p.start_proof_urls : p.start_proof_url ? [p.start_proof_url] : []));

  return (
    <section className="space-y-3 max-w-3xl mx-auto">
      <h2 className="font-tactical font-bold text-white text-lg flex items-center gap-2"><Clock className="w-5 h-5 text-emerald-400" /> Validations de mon équipe</h2>
      {!team && <div className="text-sm text-amber-300 bg-amber-950/40 border border-amber-800 rounded-xl p-3">Tu n'as pas encore d'équipe. Demande au responsable de t'en attribuer une : tu verras alors les sessions des opérateurs de la même équipe.</div>}
      {team && <div className="text-[12px] text-slate-400">Équipe : <span className="text-white font-semibold">{team}</span> · {list.length} en attente</div>}
      {error && <div role="alert" className="text-sm text-rose-300">{error}</div>}
      {team && list.length === 0 && <div className="text-sm text-slate-300 bg-[#0f1722] border border-slate-700 rounded-xl p-4">Rien à valider pour le moment.</div>}

      <ul className="space-y-3">
        {list.map(p => {
          const imgs = proofs(p);
          const end = p.status === 'pending_end';
          return (
            <li key={p.id} className="bg-[#0f1722] border border-slate-700 rounded-2xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-white font-semibold truncate">{p.employee_name}</div>
                  <div className="text-[12px] text-slate-300 truncate">{p.client_name}{p.post_number ? ` · mission ${p.post_number}` : ''}</div>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${end ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{end ? 'Fin' : 'Départ'}</span>
              </div>
              <div className="text-[11px] text-slate-400">{p.date} · {(end ? p.end_time : p.start_time) || ''}{end ? ` · score ${p.initial_score} → ${p.final_score ?? p.current_score}` : ` · score de départ ${p.initial_score}`}</div>
              {p.start_notes && <div className="text-[12px] text-slate-300 break-words">{p.start_notes}</div>}
              {imgs.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {imgs.map((u, i) => (
                    <button key={i} type="button" onClick={() => onOpenProofLightbox({ imageUrl: u, gallery: imgs, title: end ? 'Preuve de fin' : 'Preuve de départ', subtitle: p.client_name, operatorName: p.employee_name, score: end ? (p.final_score ?? p.current_score) : p.initial_score })} className="shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-slate-600">
                      <img src={u} alt={`Preuve ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
              {refusing === p.id ? (
                <div className="space-y-2">
                  <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={300} placeholder="Motif du refus (obligatoire)" className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2 text-sm text-white" />
                  <div className="flex gap-2">
                    <button type="button" disabled={busy === p.id || !reason.trim()} onClick={() => void decide(p, false)} className="flex-1 min-h-[44px] rounded-full bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold">Confirmer le refus</button>
                    <button type="button" onClick={() => { setRefusing(null); setReason(''); }} className="min-h-[44px] px-4 rounded-full border border-slate-600 text-slate-200 text-sm font-semibold">Annuler</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" disabled={busy === p.id} onClick={() => void decide(p, true)} className="flex-1 min-h-[44px] rounded-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" /> Valider</button>
                  <button type="button" disabled={busy === p.id} onClick={() => { setRefusing(p.id); setReason(''); setError(''); }} className="flex-1 min-h-[44px] rounded-full bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-200 text-sm font-bold flex items-center justify-center gap-2"><XCircle className="w-4 h-4" /> Refuser</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
