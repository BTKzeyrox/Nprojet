import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, Image as ImageIcon, Sun, Moon, Phone, MessageCircle, Eye, KeyRound } from 'lucide-react';
import { User } from '../types';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { compressImageToDataUrl } from '../utils/imageUtils';
import { db } from '../db/store';
import { shiftHoursLabel } from '../utils/formatUtils';
import { Avatar } from './Avatar';
import { useApp } from '../context/AppContext';
import { badgeAccess, canSeeProfileBadges, usePerformance } from '../utils/usePerformance';
import { BadgeChips, ScoreRing } from './PerformanceBadges';
import { ModeSwitchSection } from './ModeSwitchSection';
import { usePresence, setPresence, PRESENCE_LIST, PRESENCE_LABEL, PRESENCE_DOT } from '../utils/availability';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  /** Bouton « Message » : ouvre la discussion privée avec cette personne (absent sur son propre profil). */
  onMessage?: (u: User) => void;
  /** Responsable, sur son propre profil : passer en vue opérateur et revenir. */
  canSwitchMode?: boolean;
  modeSwitchHidden?: boolean;
  operatorMode?: boolean;
  onToggleOperatorMode?: () => void;
}

/** Mon statut (Disponible / Occupé / Absent) : réglé sur cet appareil. */
const StatusPicker: React.FC<{ uid: string }> = ({ uid }) => {
  const cur = usePresence(uid);
  return (
    <div data-status-picker className="space-y-1.5">
      <div className="text-xs text-slate-300 uppercase font-mono">Mon statut</div>
      <div className="grid grid-cols-3 gap-2">
        {PRESENCE_LIST.map(p => (
          <button key={p} type="button" data-status={p} onClick={() => setPresence(uid, p)} aria-pressed={cur === p}
            className={`min-h-[44px] rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${cur === p ? 'border-emerald-500 bg-emerald-950/60 text-emerald-200' : 'border-slate-600 bg-[#141e2a] text-slate-300'}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${PRESENCE_DOT[p]}`} />{PRESENCE_LABEL[p]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400">Réglé sur cet appareil.</p>
    </div>
  );
};

/** Changer mon mot de passe (ancien + nouveau). */
const PasswordForm: React.FC<{ uid: string }> = ({ uid }) => {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setMsg(null);
    if (nw.length < 6) return setMsg({ ok: false, t: 'Le nouveau mot de passe doit avoir au moins 6 caractères.' });
    setBusy(true);
    const r = await db.setPassword(uid, nw, cur);
    setBusy(false);
    if (!r.success) return setMsg({ ok: false, t: r.error || 'Changement impossible.' });
    setCur(''); setNw(''); setOpen(false);
    setMsg({ ok: true, t: 'Mot de passe changé.' });
  };
  const inp = 'rounded-lg w-full bg-[#141e2a] border border-slate-600 p-2 text-white focus:border-emerald-500 focus:outline-none';
  return (
    <div data-password-form className="space-y-2">
      {!open ? (
        <button type="button" onClick={() => { setOpen(true); setMsg(null); }} className="rounded-lg w-full min-h-[44px] px-3 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-sm font-semibold cursor-pointer flex items-center justify-center gap-2">
          <KeyRound className="w-4 h-4" /> Changer mon mot de passe
        </button>
      ) : (
        <div className="space-y-2 text-xs font-mono">
          <input type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} placeholder="Mot de passe actuel" className={inp} />
          <input type="password" autoComplete="new-password" value={nw} onChange={e => setNw(e.target.value)} placeholder="Nouveau mot de passe" className={inp} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setOpen(false); setCur(''); setNw(''); }} className="rounded-lg min-h-[44px] bg-[#141e2a] border border-slate-600 text-sm font-semibold cursor-pointer">Annuler</button>
            <button type="button" disabled={busy || !cur || !nw} onClick={save} className="rounded-lg min-h-[44px] bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white cursor-pointer disabled:opacity-60">{busy ? 'Envoi…' : 'Changer'}</button>
          </div>
        </div>
      )}
      {msg && <div className={`text-xs ${msg.ok ? 'text-emerald-300' : 'text-red-400'}`}>{msg.t}</div>}
    </div>
  );
};

/** Score et badges calculés (module 3). Montré au responsable et à la personne elle-même, JAMAIS à un collègue (D8). */
const ProfileBadges: React.FC<{ userId: string; self: boolean }> = ({ userId, self }) => {
  const { lang } = useApp();
  const { res } = usePerformance();
  const access = badgeAccess();
  const p = res.employees.get(userId);
  if (!p || !access.enabled || (self && !access.seesBadges)) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-2.5">
      <span className="text-white"><ScoreRing score={p.score} size={48} tone={self ? 'neutral' : 'color'} /></span>
      <div className="min-w-0 text-xs space-y-1">
        <div className="font-bold text-slate-100">Performance</div>
        {p.badges.length ? <BadgeChips badges={p.badges} lang={lang} max={4} /> : <div className="text-slate-400">{p.score === null ? (lang === 'en' ? 'Not enough data yet' : 'Pas encore assez de données') : (lang === 'en' ? 'No badge yet' : 'Aucun badge pour l\'instant')}</div>}
      </div>
    </div>
  );
};

// Fenêtre « Profil » : photo, nom, shift, téléphone (plus de CV ni de pièce d'identité)
export const CVViewerModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, user, onMessage, canSwitchMode = false, modeSwitchHidden = false, operatorMode = false, onToggleOperatorMode }) => {
  useLockBodyScroll(isOpen);
  const [, force] = useState(0);
  const [error, setError] = useState('');
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  // Opérateur qui modifie son propre profil : tout passe par une demande validée par l'admin
  const [fName, setFName] = useState('');
  const [fUser, setFUser] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [fAvatar, setFAvatar] = useState<string>('');
  const [fNote, setFNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const [editing, setEditing] = useState(false);

  const uid = user?.id;
  useEffect(() => {
    if (!isOpen || !user) return;
    const u = db.getUsers().find(x => x.id === user.id) || user;
    setFName(u.name); setFUser(u.username); setFPhone(u.phone || ''); setFAvatar('');
    setError(''); setInfo(''); setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, uid]);

  if (!isOpen || !user) return null;

  const me = db.getCurrentUser();
  const live = db.getUsers().find(u => u.id === user.id) || user;
  const isSelfOperator = !!me && me.id === live.id && me.role === 'employee';
  const canEdit = !!me && me.role === 'admin';
  const isSelf = !!me && me.id === live.id;
  const myReq = isSelfOperator ? db.getProfileRequests().find(r => r.user_id === live.id) : undefined;
  const pending = myReq && myReq.status === 'pending' ? myReq : undefined;
  const refused = myReq && myReq.status === 'rejected' ? myReq : undefined;

  const pickForRequest = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const small = await compressImageToDataUrl(file);
      const url = await db.uploadFile(small);
      if (!url) setError('Envoi de la photo impossible. Réessaie.');
      else setFAvatar(url);
    } catch {
      setError('Impossible de lire cette image.');
    } finally {
      setBusy(false);
    }
  };

  const sendRequest = async () => {
    setError(''); setInfo('');
    setBusy(true);
    const r = await db.submitProfileRequest({ name: fName, username: fUser, phone: fPhone, avatarUrl: fAvatar, note: fNote.trim() });
    setBusy(false);
    if (!r.success) return setError(r.error || 'Envoi impossible.');
    setEditing(false);
    setFAvatar('');
    setInfo('Demande envoyée. Elle sera appliquée après validation de l\'administrateur.');
  };

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const url = await compressImageToDataUrl(file);
      db.updateUser(live.id, { avatar_url: url });
      force(n => n + 1);
    } catch {
      setError('Impossible de lire cette image.');
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-[#0d1624] border border-slate-700 rounded-3xl shadow-2xl p-5 space-y-4 text-slate-100 max-h-[92dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-tactical font-bold text-lg">Profil</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:text-white" aria-label="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2">
          <Avatar src={live.avatar_url} name={live.name} className="w-32 h-32 text-3xl rounded-full ring-4 ring-blue-500/30" />
          <div className="text-center">
            <div className="font-bold text-base">{live.name}</div>
            <div className="text-xs text-slate-400">@{live.username}</div>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          {live.role === 'employee' && (
            <div className="flex items-center gap-2 text-slate-300">
              {live.shift === 'day' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-300" />}
              {live.shift === 'day' ? `Vacation Jour (${shiftHoursLabel('day', db.getSettings())})` : `Vacation Nuit (${shiftHoursLabel('night', db.getSettings())})`}
            </div>
          )}
          {canSeeProfileBadges(me, live) && <ProfileBadges userId={live.id} self={me?.role !== 'admin'} />}
          {live.phone && !!me && (me.role === 'admin' || me.id === live.id) && (
            <div className="flex items-center gap-2 text-slate-300">
              <Phone className="w-4 h-4 text-cyan-400" />
              {live.phone}
            </div>
          )}
        </div>

        {onMessage && !!me && me.id !== live.id && live.status !== 'blocked' && (
          <button type="button" onClick={() => onMessage(live)} className="rounded-lg w-full min-h-[44px] px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white cursor-pointer flex items-center justify-center gap-2">
            <MessageCircle className="w-4 h-4" /> Message
          </button>
        )}

        {canEdit && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => camRef.current?.click()}
                className="rounded-lg flex items-center justify-center gap-2 px-2 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-sm font-semibold text-center leading-tight"
              >
                <Camera className="w-4 h-4 shrink-0" /> Prendre une photo
              </button>
              <button
                type="button"
                onClick={() => galRef.current?.click()}
                className="rounded-lg flex items-center justify-center gap-2 px-2 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-sm font-semibold text-center leading-tight"
              >
                <ImageIcon className="w-4 h-4 shrink-0" /> Changer la photo
              </button>
            </div>
            <input ref={camRef} type="file" accept="image/*" capture="user" className="hidden" onChange={pick} />
            <input ref={galRef} type="file" accept="image/*" className="hidden" onChange={pick} />
          </>
        )}

        {isSelfOperator && (
          <div className="space-y-2">
            {refused && !pending && (
              <div className="rounded-lg p-2.5 bg-red-950/70 border border-red-500/50 text-red-200 text-xs leading-relaxed">
                Modification refusée : {refused.reason || 'sans motif'}
              </div>
            )}
            {pending && (
              <div className="rounded-lg p-2.5 bg-amber-950/70 border border-amber-500/50 text-amber-200 text-xs leading-relaxed">
                Modification en attente de validation par l'administrateur : {pending.name} · @{pending.username}
                {pending.avatar_url !== pending.old.avatar_url ? ' · nouvelle photo' : ''}
              </div>
            )}
            {!editing ? (
              <button
                type="button"
                onClick={() => { setEditing(true); setInfo(''); }}
                className="rounded-lg w-full px-3 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-sm font-semibold cursor-pointer"
              >
                {pending ? 'Modifier ma demande' : 'Modifier mon profil'}
              </button>
            ) : (
              <div className="space-y-2 text-xs font-mono">
                <p className="text-slate-400 font-sans text-xs leading-relaxed">Les changements ne sont appliqués qu'après validation de l'administrateur.</p>
                <div className="flex items-center gap-3">
                  <Avatar src={fAvatar || live.avatar_url} name={fName || live.name} className="w-14 h-14 text-lg" />
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    <button type="button" disabled={busy} onClick={() => camRef.current?.click()} className="rounded-lg px-2 py-2 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 font-semibold cursor-pointer disabled:opacity-50">
                      Photo
                    </button>
                    <button type="button" disabled={busy} onClick={() => galRef.current?.click()} className="rounded-lg px-2 py-2 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 font-semibold cursor-pointer disabled:opacity-50">
                      Galerie
                    </button>
                  </div>
                </div>
                <input ref={camRef} type="file" accept="image/*" capture="user" className="hidden" onChange={pickForRequest} />
                <input ref={galRef} type="file" accept="image/*" className="hidden" onChange={pickForRequest} />
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Nom</label>
                  <input value={fName} onChange={e => setFName(e.target.value)} className="rounded-lg w-full bg-[#141e2a] border border-slate-600 p-2 text-white focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Pseudo</label>
                  <input value={fUser} onChange={e => setFUser(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} className="rounded-lg w-full bg-[#141e2a] border border-slate-600 p-2 text-white focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Téléphone</label>
                  <input value={fPhone} onChange={e => setFPhone(e.target.value)} inputMode="tel" className="rounded-lg w-full bg-[#141e2a] border border-slate-600 p-2 text-white focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-slate-300 uppercase mb-1">Description (facultatif)</label>
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={fNote}
                    onChange={e => setFNote(e.target.value)}
                    placeholder="Un mot pour le responsable (facultatif)"
                    className="rounded-lg w-full bg-[#141e2a] border border-slate-600 p-2.5 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button type="button" onClick={() => { setEditing(false); setError(''); }} className="rounded-lg px-3 py-2.5 bg-[#141e2a] hover:bg-[#1b2f44] border border-slate-600 text-sm font-semibold cursor-pointer">
                    Annuler
                  </button>
                  <button type="button" disabled={busy} onClick={sendRequest} className="rounded-lg px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white cursor-pointer disabled:opacity-60">
                    {busy ? 'Envoi…' : 'Envoyer'}
                  </button>
                </div>
              </div>
            )}
            {info && <div className="p-2.5 bg-emerald-950 border rounded-lg border-emerald-500/50 text-emerald-200 text-xs leading-relaxed">{info}</div>}
          </div>
        )}
        {isSelf && (
          <div className="space-y-3 border-t border-slate-700 pt-3">
            <StatusPicker uid={live.id} />
            <PasswordForm uid={live.id} />
            {canSwitchMode && onToggleOperatorMode && (
              <div data-mode-switch className="space-y-2">
                {(!modeSwitchHidden || operatorMode) && (
                  <button type="button" onClick={onToggleOperatorMode} className={`w-full min-h-[44px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-bold cursor-pointer ${operatorMode ? 'bg-amber-500/10 border-amber-500/50 text-amber-200' : 'bg-[#141e2a] border-slate-600 text-slate-100'}`}>
                    <Eye className="w-4 h-4" /> {operatorMode ? 'Retour responsable' : 'Passer en vue opérateur'}
                  </button>
                )}
                {!operatorMode && <ModeSwitchSection />}
              </div>
            )}
          </div>
        )}
        {error && <div className="text-sm text-red-400">{error}</div>}
      </div>
    </div>
  );
};
