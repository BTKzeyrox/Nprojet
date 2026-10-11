import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, Pencil, Search, Trash2, UserMinus, UserPlus, Users, X, Check } from 'lucide-react';
import { db } from '../db/store';
import { ChatGroup, User } from '../types';
import { Avatar } from './Avatar';
import { askConfirm } from './ConfirmModal';
import { useLockBodyScroll } from '../utils/useLockBodyScroll';
import { useApp } from '../context/AppContext';

const useL = () => useApp().theme === 'light';

const Shell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  useLockBodyScroll(true);
  const L = useL();
  return createPortal(
    <div className="fixed inset-0 z-[9998] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-3" onClick={onClose}>
      <div className={`w-full max-w-md max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-3xl border shadow-2xl ${L ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f1b2d] border-slate-700 text-white'}`} onClick={e => e.stopPropagation()}>
        <div className="shrink-0 px-4 py-3 flex items-center justify-between">
          <h3 className="font-bold text-base">{title}</h3>
          <button type="button" onClick={onClose} className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer ${L ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/10 hover:bg-white/20 text-slate-200'}`} title="Fermer"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 space-y-3" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>{children}</div>
      </div>
    </div>,
    document.body
  );
};

const fieldCls = (L: boolean) => `w-full rounded-full border px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 ${L ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-[#0a1424] border-slate-600 text-white'}`;
const btnCls = 'w-full min-h-[46px] px-4 rounded-full text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

const PersonRow: React.FC<{ u: User; right?: React.ReactNode; onClick?: () => void }> = ({ u, right, onClick }) => {
  const L = useL();
  return (
    <div onClick={onClick} className={`flex items-center gap-3 p-2 rounded-2xl ${onClick ? `cursor-pointer ${L ? 'hover:bg-slate-100' : 'hover:bg-white/5'}` : ''}`}>
      <Avatar src={u.avatar_url} name={u.name} className="w-10 h-10" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold break-words leading-tight">{u.name}</span>
        <span className={`block text-[11px] ${L ? 'text-slate-500' : 'text-slate-400'}`}>{u.role === 'admin' ? 'Administrateur' : `@${u.username}`}</span>
      </span>
      {right}
    </div>
  );
};

const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string }> = ({ value, onChange, placeholder }) => {
  const L = useL();
  return (
    <div className="relative">
      <Search className={`w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 ${L ? 'text-slate-400' : 'text-slate-500'}`} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={`${fieldCls(L)} pl-10`} />
    </div>
  );
};

/** Nouvelle discussion (1 à 1) ou nouveau groupe. */
export const NewChatModal: React.FC<{
  currentUser: User;
  users: User[];
  onClose: () => void;
  onOpenThread: (threadId: string) => void;
}> = ({ currentUser, users, onClose, onOpenThread }) => {
  const L = useL();
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
  const tabCls = (on: boolean) => `${btnCls} ${on ? 'bg-blue-600 text-white' : L ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`;
  return (
    <Shell title="Nouvelle conversation" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setTab('one')} className={tabCls(tab === 'one')}>Discussion</button>
        <button type="button" onClick={() => setTab('group')} className={tabCls(tab === 'group')}><Users className="w-4 h-4" />Nouveau groupe</button>
      </div>
      {tab === 'group' && <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Nom du groupe" className={fieldCls(L)} />}
      <SearchBox value={q} onChange={setQ} placeholder="Chercher une personne" />
      <div>
        {people.length === 0 && <p className="text-xs opacity-60 py-3 text-center">Personne trouvée.</p>}
        {people.map(u =>
          tab === 'one' ? (
            <PersonRow key={u.id} u={u} onClick={() => { onOpenThread(u.id); onClose(); }} />
          ) : (
            <PersonRow key={u.id} u={u} onClick={() => toggle(u.id)} right={<span className={`w-6 h-6 rounded-full border flex items-center justify-center ${picked.includes(u.id) ? 'bg-blue-600 border-blue-600 text-white' : L ? 'border-slate-300' : 'border-slate-500'}`}>{picked.includes(u.id) && <Check className="w-4 h-4" />}</span>} />
          )
        )}
      </div>
      {tab === 'group' && (
        <>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="button" disabled={!name.trim() || picked.length === 0} onClick={create} className={`${btnCls} bg-blue-600 hover:bg-blue-500 text-white`}>
            Créer le groupe ({picked.length + 1} membres)
          </button>
        </>
      )}
    </Shell>
  );
};

/** Infos du groupe (comme WhatsApp / Telegram) : nom, membres, ajouter / retirer, quitter, supprimer. */
export const GroupInfoModal: React.FC<{
  group: ChatGroup;
  users: User[];
  currentUser: User;
  onClose: () => void;
  onGone: () => void; // le groupe a été quitté ou supprimé
}> = ({ group, users, currentUser, onClose, onGone }) => {
  const L = useL();
  const isAdmin = currentUser.role === 'admin';
  const canManage = isAdmin || group.owner_id === currentUser.id;
  const isMember = group.members.includes(currentUser.id);
  const [name, setName] = useState(group.name);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const byId = (id: string) => users.find(u => u.id === id);
  const sub = L ? 'text-slate-500' : 'text-slate-400';
  const match = (u: User) => `${u.name} ${u.username}`.toLowerCase().includes(q.trim().toLowerCase());
  const addable = users.filter(u => !group.members.includes(u.id) && u.status !== 'blocked' && match(u));
  const members = group.members.map(byId).filter((u): u is User => !!u && match(u)).sort((a, b) => (a.id === group.owner_id ? -1 : b.id === group.owner_id ? 1 : a.name.localeCompare(b.name)));

  const saveName = () => {
    const r = db.updateGroup(group.id, currentUser.id, { name });
    setMsg(r.success ? 'Nom enregistré.' : r.error || 'Erreur.');
    if (r.success) setEditing(false);
  };
  const setMembers = (list: string[]) => {
    const r = db.updateGroup(group.id, currentUser.id, { members: list });
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
      {/* En-tête : grand rond du groupe + nom */}
      <div className="flex flex-col items-center text-center gap-2 pt-1">
        <div className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-extrabold text-white shadow-lg" style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)' }}>
          {(group.name.trim()[0] || 'G').toUpperCase()}
        </div>
        {editing && canManage ? (
          <div className="flex gap-2 w-full">
            <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={40} className={fieldCls(L)} />
            <button type="button" onClick={saveName} disabled={!name.trim() || name.trim() === group.name} className="w-11 h-11 shrink-0 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center disabled:opacity-50 cursor-pointer" title="Enregistrer"><Check className="w-5 h-5" /></button>
          </div>
        ) : (
          <div className="flex items-center gap-2 max-w-full">
            <h4 className="text-xl font-bold break-words">{group.name}</h4>
            {canManage && (
              <button type="button" onClick={() => { setName(group.name); setEditing(true); }} className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center cursor-pointer ${L ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/10 hover:bg-white/20 text-slate-200'}`} title="Changer le nom"><Pencil className="w-4 h-4" /></button>
            )}
          </div>
        )}
        <p className={`text-xs ${sub}`}>Groupe · {group.members.length} membres · responsable : {byId(group.owner_id)?.name || '—'}</p>
      </div>

      {msg && <p className="text-sm text-emerald-600 text-center">{msg}</p>}

      {/* Membres */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{group.members.length} membres</span>
        {canManage && (
          <button type="button" onClick={() => setAdding(a => !a)} className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center gap-1.5 cursor-pointer">
            <UserPlus className="w-3.5 h-3.5" /> Ajouter
          </button>
        )}
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="Chercher un membre" />
      {adding && canManage && (
        <div className={`rounded-2xl border p-1 ${L ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-white/[0.03]'}`}>
          {addable.length === 0 && <p className={`text-xs p-3 text-center ${sub}`}>Personne à ajouter.</p>}
          {addable.map(u => <PersonRow key={u.id} u={u} onClick={() => setMembers([...group.members, u.id])} right={<UserPlus className="w-4 h-4 text-blue-500" />} />)}
        </div>
      )}
      <div>
        {members.map(u => (
          <PersonRow
            key={u.id}
            u={u}
            right={
              u.id === group.owner_id ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-600/15 text-blue-600 border border-blue-500/30">Responsable</span>
              ) : canManage && u.id !== currentUser.id ? (
                <button type="button" onClick={() => setMembers(group.members.filter(m => m !== u.id))} className="w-10 h-10 rounded-full flex items-center justify-center text-red-500 hover:bg-red-500/10 cursor-pointer" title="Retirer du groupe">
                  <UserMinus className="w-5 h-5" />
                </button>
              ) : undefined
            }
          />
        ))}
      </div>

      {isMember && (
        <button type="button" onClick={leave} className={`${btnCls} border ${L ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'}`}>
          <LogOut className="w-4 h-4" /> Quitter le groupe
        </button>
      )}
      {canManage && (
        <button type="button" onClick={remove} className={`${btnCls} border ${L ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20'}`}>
          <Trash2 className="w-4 h-4" /> Supprimer le groupe
        </button>
      )}
    </Shell>
  );
};
