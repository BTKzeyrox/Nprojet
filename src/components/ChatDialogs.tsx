import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, Search, Trash2, UserMinus, UserPlus, X } from 'lucide-react';
import { db } from '../db/store';
import { ChatGroup, User } from '../types';
import { Avatar } from './Avatar';
import { askConfirm } from './ConfirmModal';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';

const Shell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  useLockBodyScroll(true);
  return createPortal(
    <div className="fixed inset-0 z-[9998] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-3" onClick={onClose}>
      <div className="w-full max-w-md max-h-[88dvh] flex flex-col bg-[#0f1722] border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 px-3 py-3 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-tactical font-bold text-white text-sm">{title}</h3>
          <button type="button" onClick={onClose} className="min-w-[44px] min-h-[44px] -my-2 flex items-center justify-center text-slate-300 cursor-pointer" title="Fermer"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-3">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const inputCls = 'w-full bg-[#0d1622] border border-slate-600 p-2.5 text-white text-sm';
const btnCls = 'w-full min-h-[46px] px-4 text-xs font-mono font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

const PersonRow: React.FC<{ u: User; right?: React.ReactNode; onClick?: () => void }> = ({ u, right, onClick }) => (
  <div onClick={onClick} className={`flex items-center gap-2.5 p-1.5 ${onClick ? 'cursor-pointer hover:bg-[#121c28]' : ''}`}>
    <Avatar src={u.avatar_url} name={u.name} className="w-9 h-9" />
    <span className="min-w-0 flex-1">
      <span className="block text-sm text-white break-words leading-tight">{u.name}</span>
      <span className="block text-[11px] text-slate-400">{u.role === 'admin' ? 'Administrateur' : `@${u.username}`}</span>
    </span>
    {right}
  </div>
);

/** Nouvelle discussion (1 à 1) ou nouveau groupe. */
export const NewChatModal: React.FC<{
  currentUser: User;
  users: User[];
  onClose: () => void;
  onOpenThread: (threadId: string) => void;
}> = ({ currentUser, users, onClose, onOpenThread }) => {
  const [tab, setTab] = useState<'one' | 'group'>('one');
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState('');
  const people = useMemo(
    () => users.filter(u => u.id !== currentUser.id && u.status !== 'blocked' && `${u.name} ${u.username}`.toLowerCase().includes(q.trim().toLowerCase())),
    [users, currentUser.id, q]
  );
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const create = () => {
    const r = db.createGroup(currentUser.id, name, picked);
    if (!r.success) return setError(r.error || 'Création impossible.');
    onOpenThread(r.id!);
    onClose();
  };
  return (
    <Shell title="Nouvelle conversation" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setTab('one')} className={`${btnCls} ${tab === 'one' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300'}`}>Discussion</button>
        <button type="button" onClick={() => setTab('group')} className={`${btnCls} ${tab === 'group' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300'}`}>Nouveau groupe</button>
      </div>
      {tab === 'group' && <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Nom du groupe" className={inputCls} />}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-3.5" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher une personne" className={`${inputCls} pl-8`} />
      </div>
      <div className="divide-y divide-slate-800/60">
        {people.length === 0 && <p className="text-xs text-slate-500 py-3 text-center">Personne trouvée.</p>}
        {people.map(u =>
          tab === 'one' ? (
            <PersonRow key={u.id} u={u} onClick={() => { onOpenThread(u.id); onClose(); }} />
          ) : (
            <PersonRow key={u.id} u={u} onClick={() => toggle(u.id)} right={<input type="checkbox" readOnly checked={picked.includes(u.id)} className="w-5 h-5 accent-emerald-500 pointer-events-none" />} />
          )
        )}
      </div>
      {tab === 'group' && (
        <>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button type="button" disabled={!name.trim() || picked.length === 0} onClick={create} className={`${btnCls} bg-emerald-700 hover:bg-emerald-600 text-white`}>
            Créer le groupe ({picked.length + 1} membres)
          </button>
        </>
      )}
    </Shell>
  );
};

/** Infos du groupe : membres, renommer, ajouter/retirer, quitter, supprimer. */
export const GroupInfoModal: React.FC<{
  group: ChatGroup;
  users: User[];
  currentUser: User;
  onClose: () => void;
  onGone: () => void; // le groupe a été quitté ou supprimé
}> = ({ group, users, currentUser, onClose, onGone }) => {
  const isAdmin = currentUser.role === 'admin';
  const canManage = isAdmin || group.owner_id === currentUser.id;
  const isMember = group.members.includes(currentUser.id);
  const [name, setName] = useState(group.name);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');
  const byId = (id: string) => users.find(u => u.id === id);
  const addable = users.filter(u => !group.members.includes(u.id) && u.status !== 'blocked');

  const saveName = () => {
    const r = db.updateGroup(group.id, currentUser.id, { name });
    setMsg(r.success ? 'Nom enregistré.' : r.error || 'Erreur.');
  };
  const setMembers = (members: string[]) => {
    const r = db.updateGroup(group.id, currentUser.id, { members });
    if (!r.success) setMsg(r.error || 'Erreur.');
  };
  const leave = () =>
    askConfirm({
      title: 'Quitter ce groupe ?',
      message: 'Tu ne recevras plus ses messages.',
      confirmLabel: 'Quitter',
      danger: true,
      onConfirm: () => { db.leaveGroup(group.id, currentUser.id); onGone(); onClose(); },
    });
  const remove = () =>
    askConfirm({
      title: 'Supprimer ce groupe ?',
      message: 'Le groupe et tous ses messages seront supprimés pour tout le monde. Cette action est définitive.',
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: () => { db.deleteGroup(group.id, currentUser.id); onGone(); onClose(); },
    });

  return (
    <Shell title="Infos du groupe" onClose={onClose}>
      {canManage ? (
        <div className="flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)} maxLength={40} className={inputCls} />
          <button type="button" onClick={saveName} disabled={!name.trim() || name.trim() === group.name} className="px-4 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold disabled:opacity-50 cursor-pointer">OK</button>
        </div>
      ) : (
        <div className="text-white font-bold">{group.name}</div>
      )}
      <div className="text-[11px] text-slate-400 uppercase font-mono">{group.members.length} membres · responsable : {byId(group.owner_id)?.name || '—'}</div>
      <div className="divide-y divide-slate-800/60">
        {group.members.map(id => {
          const u = byId(id);
          if (!u) return null;
          return (
            <PersonRow
              key={id}
              u={u}
              right={
                canManage && id !== group.owner_id && id !== currentUser.id ? (
                  <button type="button" onClick={() => setMembers(group.members.filter(m => m !== id))} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-red-400 cursor-pointer" title="Retirer du groupe">
                    <UserMinus className="w-5 h-5" />
                  </button>
                ) : id === group.owner_id ? <span className="text-[10px] text-amber-300 font-mono">RESPONSABLE</span> : undefined
              }
            />
          );
        })}
      </div>
      {canManage && (
        <>
          <button type="button" onClick={() => setAdding(a => !a)} className={`${btnCls} bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white`}>
            <UserPlus className="w-4 h-4" /> Ajouter des membres
          </button>
          {adding && (
            <div className="divide-y divide-slate-800/60 border border-slate-800">
              {addable.length === 0 && <p className="text-xs text-slate-500 p-3 text-center">Tout le monde est déjà dans le groupe.</p>}
              {addable.map(u => <PersonRow key={u.id} u={u} onClick={() => setMembers([...group.members, u.id])} right={<UserPlus className="w-4 h-4 text-emerald-400" />} />)}
            </div>
          )}
        </>
      )}
      {msg && <p className="text-sm text-emerald-300">{msg}</p>}
      {isMember && (
        <button type="button" onClick={leave} className={`${btnCls} bg-amber-950/70 hover:bg-amber-900 border border-amber-700 text-amber-200`}>
          <LogOut className="w-4 h-4" /> Quitter le groupe
        </button>
      )}
      {canManage && (
        <button type="button" onClick={remove} className={`${btnCls} bg-red-950/80 hover:bg-red-900 border border-red-700 text-red-200`}>
          <Trash2 className="w-4 h-4" /> Supprimer le groupe
        </button>
      )}
    </Shell>
  );
};
