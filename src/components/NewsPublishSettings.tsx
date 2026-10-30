import React, { useEffect, useState } from 'react';
import { Newspaper } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { AUDIENCE_ROLES, roleLabel, type NewsRole, type PublishMode } from '../utils/newsAccess';

/** Réglages > Équipe > Publications des équipes : qui peut publier dans les Actualités (sans validation, avec validation ou pas du tout) et si l'auteur peut modifier ses publications déjà publiées. Le serveur applique le même réglage. */
export const NewsPublishSettings: React.FC = () => {
  const { lang } = useApp();
  const l: 'fr' | 'en' = lang === 'en' ? 'en' : 'fr';
  const t = (fr: string, en: string) => (l === 'en' ? en : fr);
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const pol = db.getNewsPolicy();
  const save = (next: typeof pol) => db.updateSettings({ news_publish: next });
  const modes: { id: PublishMode; label: string }[] = [
    { id: 'off', label: t('Ne publie pas', 'Cannot publish') },
    { id: 'review', label: t('Passe par ma validation', 'Needs my approval') },
    { id: 'direct', label: t('Publie directement', 'Publishes directly') },
  ];
  const sel = 'w-full min-h-[44px] rounded-lg border px-3 text-sm bg-[#141e2a] border-slate-600 text-white cursor-pointer';
  return (
    <section className="bg-[#0f1722] border border-slate-700 p-4 space-y-3 rounded-2xl" data-testid="news-publish-settings" {...(l === 'en' ? { 'data-notranslate': '' } : {})}>
      <h3 className="font-tactical font-bold text-white flex items-center gap-2"><Newspaper className="w-4 h-4 text-emerald-400" />{t('Publications des équipes', 'Team posts')}</h3>
      <p className="text-[11px] text-slate-400">{t('Choisis qui peut publier dans les Actualités. Chaque publication peut être réservée à certains rôles au moment de l’écrire (« Visible par »). Toi, tu publies et tu vois toujours tout.', 'Choose who can post in the News. Each post can be limited to some roles when it is written (“Visible by”). You can always post and see everything.')}</p>
      <div className="space-y-2">
        {AUDIENCE_ROLES.map((r: NewsRole) => (
          <label key={r} className="block space-y-1">
            <span className="text-xs font-semibold text-slate-300">{roleLabel(r, l)}</span>
            <select value={pol[r]} onChange={e => save({ ...pol, [r]: e.target.value as PublishMode })} className={sel} data-news-role={r}>
              {modes.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-200 cursor-pointer min-h-[44px]">
        <input type="checkbox" className="mt-1" checked={pol.allow_edit} onChange={e => save({ ...pol, allow_edit: e.target.checked })} data-news-allow-edit />
        <span>{t('Peut modifier ses publications déjà publiées', 'Can edit their own published posts')}<span className="block text-[11px] text-slate-400">{t('Chacun modifie seulement les siennes ; « modifiée » s’affiche sur la publication. Une publication modifiée reste publiée.', 'Everyone edits only their own; “edited” is shown on the post. An edited post stays published.')}</span></span>
      </label>
    </section>
  );
};
