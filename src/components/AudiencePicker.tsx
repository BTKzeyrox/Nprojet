// Choix « Visible par » d'une publication ou d'une story : Tous (par défaut), des rôles entiers, et/ou des personnes choisies une à une (BTK 2026-11-09). Le responsable et l'auteur voient toujours le contenu.
// Utilisé par : views/FeedView.tsx (publier, modifier) et components/Stories.tsx (story).
import React, { useState } from 'react';
import { Eye } from 'lucide-react';
import { db } from '../db/store';
import { AUDIENCE_ROLES, audienceLabel, newsAudience, roleLabel, type NewsRole } from '../utils/newsAccess';

export interface Aud { roles: NewsRole[]; users: string[] }
export const audOf = (post: { audience?: unknown; audience_users?: unknown }): Aud => { const a = newsAudience(post); return { roles: a.roles, users: a.users }; };
export const AudiencePicker: React.FC<{ value: Aud; onChange: (v: Aud) => void; disabled?: boolean; light: boolean }> = ({ value, onChange, disabled, light }) => {
  const [open, setOpen] = useState(value.users.length > 0);
  const all = value.roles.length === 0 && value.users.length === 0;
  const chip = (on: boolean) => `inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full border text-xs font-semibold cursor-pointer disabled:opacity-50 ${on ? 'bg-emerald-600 text-white border-emerald-600' : light ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50' : 'bg-white/5 text-slate-200 border-white/20 hover:bg-white/10'}`;
  const people = db.getUsers().filter(u => u.status === 'active' && (u.role === 'employee' || u.role === 'team_lead' || u.role === 'accountant')).sort((x, y) => x.name.localeCompare(y.name));
  const nameOf = (id: string) => people.find(u => u.id === id)?.name;
  const norm = (roles: NewsRole[], users: string[]): Aud => roles.length === AUDIENCE_ROLES.length ? { roles: [], users: [] } : { roles, users }; // les trois rôles = tous
  const toggleRole = (r: NewsRole) => {
    const roles = value.roles.includes(r) ? value.roles.filter(x => x !== r) : [...value.roles, r];
    const users = value.users.filter(id => !roles.includes(people.find(u => u.id === id)?.role as NewsRole)); // une personne déjà couverte par son rôle n'est plus listée à part
    onChange(norm(roles, users));
  };
  const toggleUser = (id: string) => onChange({ roles: value.roles, users: value.users.includes(id) ? value.users.filter(x => x !== id) : [...value.users, id] });
  const textColor = light ? 'text-slate-500' : 'text-slate-400';
  return (
    <div data-audience-picker className="space-y-1.5">
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${light ? 'text-slate-600' : 'text-slate-300'}`}><Eye className="w-3.5 h-3.5" />Visible par</div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Visible par">
        <button type="button" disabled={disabled} aria-pressed={all} onClick={() => onChange({ roles: [], users: [] })} className={chip(all)} data-audience="all">Tous</button>
        {AUDIENCE_ROLES.map(r => <button key={r} type="button" disabled={disabled} aria-pressed={value.roles.includes(r)} onClick={() => toggleRole(r)} className={chip(value.roles.includes(r))} data-audience={r}>{roleLabel(r, 'fr')}</button>)}
        {people.length > 0 && <button type="button" disabled={disabled} aria-expanded={open} onClick={() => setOpen(o => !o)} className={chip(value.users.length > 0)} data-audience-people-toggle>{value.users.length ? `${value.users.length} personne${value.users.length > 1 ? 's' : ''} choisie${value.users.length > 1 ? 's' : ''}` : 'Choisir des personnes'}</button>}
      </div>
      {open && people.length > 0 && (
        <div data-audience-people className={`rounded-lg border p-2 space-y-2 max-h-56 overflow-y-auto ${light ? 'border-slate-200 bg-slate-50' : 'border-white/15 bg-white/5'}`}>
          {AUDIENCE_ROLES.map(r => {
            const list = people.filter(u => u.role === r);
            if (!list.length) return null;
            const whole = value.roles.includes(r);
            return (
              <div key={r}>
                <div className={`text-[11px] font-semibold mb-1 ${textColor}`}>{roleLabel(r, 'fr')}{whole ? ' (tout le groupe est choisi)' : ''}</div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map(u => { const on = whole || value.users.includes(u.id); return <button key={u.id} type="button" disabled={disabled || whole} aria-pressed={on} onClick={() => toggleUser(u.id)} className={chip(on)} data-audience-user={u.id}>{u.name}</button>; })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className={`text-[11px] ${textColor}`}>{all ? 'Toute l’équipe la voit.' : `Seulement : ${audienceLabel(value.roles, 'fr', value.users, nameOf)}. Toi et le responsable la voyez toujours.`}</div>
    </div>
  );
};
