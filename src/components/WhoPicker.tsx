// Choix de « qui » dans les Réglages : tout le monde, des rôles entiers et/ou des personnes une à une.
// Utilisé par : NewsPublishSettings.tsx (qui peut publier une publication ou une story).
// Pour modifier : les trois cases (tout le monde, rôles, personnes) sont facultatives via showAll / showRoles ; la valeur est { all, roles, users }.
import React, { useState } from 'react';
import { db } from '../db/store';
import { AUDIENCE_ROLES, roleLabel, type NewsRole } from '../utils/newsAccess';

export interface Who { all: boolean; roles: NewsRole[]; users: string[] }

export const WhoPicker: React.FC<{ value: Who; onChange: (v: Who) => void; showAll?: boolean; showRoles?: boolean; lang?: 'fr' | 'en'; testId?: string }> = ({ value, onChange, showAll = true, showRoles = true, lang = 'fr', testId }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [open, setOpen] = useState(value.users.length > 0);
  const people = db.getUsers().filter(u => u.status === 'active' && AUDIENCE_ROLES.includes(u.role as NewsRole)).sort((a, b) => a.name.localeCompare(b.name));
  const chip = (on: boolean) => `inline-flex items-center min-h-[36px] px-3 rounded-full border text-xs font-semibold cursor-pointer ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-[#141e2a] text-slate-300 border-slate-600'}`;
  const toggleRole = (r: NewsRole) => onChange({ ...value, all: false, roles: value.roles.includes(r) ? value.roles.filter(x => x !== r) : [...value.roles, r] });
  const toggleUser = (id: string) => onChange({ ...value, all: false, users: value.users.includes(id) ? value.users.filter(x => x !== id) : [...value.users, id] });
  return (
    <div className="space-y-2" data-who-picker={testId}>
      <div className="flex flex-wrap gap-1.5">
        {showAll && <button type="button" aria-pressed={value.all} onClick={() => onChange({ all: !value.all, roles: [], users: [] })} className={chip(value.all)} data-who-all>{t('Tout le monde', 'Everyone')}</button>}
        {showRoles && AUDIENCE_ROLES.map(r => <button key={r} type="button" aria-pressed={value.roles.includes(r)} disabled={value.all} onClick={() => toggleRole(r)} className={`${chip(value.roles.includes(r) && !value.all)} disabled:opacity-40`} data-who-role={r}>{roleLabel(r, lang)}</button>)}
        {people.length > 0 && <button type="button" aria-expanded={open} disabled={value.all} onClick={() => setOpen(o => !o)} className={`${chip(value.users.length > 0 && !value.all)} disabled:opacity-40`} data-who-people-toggle>{value.users.length ? t(`${value.users.length} personne${value.users.length > 1 ? 's' : ''}`, `${value.users.length} ${value.users.length > 1 ? 'people' : 'person'}`) : t('Personnes…', 'People…')}</button>}
      </div>
      {open && !value.all && people.length > 0 && (
        <div className="rounded-lg border border-white/15 bg-white/5 p-2 space-y-2 max-h-56 overflow-y-auto" data-who-people>
          {AUDIENCE_ROLES.map(r => {
            const list = people.filter(u => u.role === r);
            if (!list.length) return null;
            const whole = value.roles.includes(r);
            return (
              <div key={r}>
                <div className="text-[11px] font-semibold mb-1 text-slate-400">{roleLabel(r, lang)}{whole ? t(' (tout le groupe est choisi)', ' (whole group chosen)') : ''}</div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map(u => { const on = whole || value.users.includes(u.id); return <button key={u.id} type="button" disabled={whole} aria-pressed={on} onClick={() => toggleUser(u.id)} className={`${chip(on)} disabled:opacity-60`} data-who-user={u.id}>{u.name}</button>; })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
