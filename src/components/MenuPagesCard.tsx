// Réglages > Général > « Pages du menu » (ADMIN) : choisir les pages affichées, simplement.
// Interrupteurs (allumé = la page est affichée), rangés comme le menu, effet IMMÉDIAT (pas de 2e bouton « Enregistrer »). Rien n'est supprimé : les données restent.
// Menu simplifié / ancien menu (cet appareil) et préréglage « Boutique » ici aussi. Les règles viennent de moduleSwitch.ts et menuGroups.ts.
import React from 'react';
import { LayoutList } from 'lucide-react';
import { db } from '../db/store';
import { useApp } from '../context/AppContext';
import { cleanCompany, readCompany } from '../utils/companyRules';
import { ALWAYS_SHOWN, MENU_ROWS } from '../utils/menuPages';
import { boutiqueHidden, hiddenToCsv, isBoutique, parseHidden } from '../utils/moduleSwitch';
import { setMenuMode, useMenuMode } from '../utils/menuMode';

const box = 'bg-[#0f1722] border border-slate-700 rounded-2xl';
export const MenuPagesCard: React.FC = () => {
  const { lang } = useApp();
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const mode = useMenuMode();
  const [, bump] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => db.subscribe(() => bump()), []);
  const [err, setErr] = React.useState('');
  const hidden = parseHidden(readCompany(db.getSettings().company).modules.hidden);
  /** Enregistre tout de suite la liste des pages cachées (le reste des Conditions ne bouge pas). */
  const save = (ids: string[]) => {
    const cur = readCompany(db.getSettings().company);
    const r = cleanCompany({ ...cur, modules: { ...cur.modules, hidden: hiddenToCsv(ids) } }, cur);
    if (r.errors.length) { setErr(t('Enregistrement refusé.', 'Save refused.')); return; }
    setErr(''); db.updateSettings({ company: r.value });
  };
  const toggle = (id: string, shown: boolean) => save(shown ? hidden.filter(x => x !== id) : [...hidden, id]);
  const pill = (on: boolean) => `flex-1 min-h-[44px] px-3 rounded-lg text-sm font-semibold border cursor-pointer ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white/5 text-slate-200 border-slate-600'}`;

  return (
    <section className={`${box} p-4 space-y-4`} data-menu-pages>
      <div>
        <h3 className="font-tactical font-bold text-white flex items-center gap-2"><LayoutList className="w-4 h-4 text-emerald-400" />{t('Pages du menu', 'Menu pages')}</h3>
        <p className="text-[11px] text-slate-400 mt-1">{t('Choisis les pages affichées. Rien n\'est supprimé : les données restent et tu peux tout remontrer. Le changement est tout de suite pour tous les comptes.', 'Choose which pages are shown. Nothing is deleted: the data stays and you can show everything again. The change applies right away to all accounts.')}</p>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-300">{t('Forme du menu (cet appareil)', 'Menu style (this device)')}</p>
        <div className="flex gap-2">
          {(['merged', 'classic'] as const).map(m => <button key={m} type="button" aria-pressed={mode === m} data-menu-mode-btn={m} onClick={() => setMenuMode(m)} className={pill(mode === m)}>{m === 'merged' ? t('Menu simplifié', 'Simplified menu') : t('Ancien menu', 'Old menu')}</button>)}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-300">{t('Préréglage', 'Preset')}</p>
        <div className="flex gap-2">
          <button type="button" data-boutique-btn="off" aria-pressed={hidden.length === 0} onClick={() => save([])} className={pill(hidden.length === 0)}>{t('Tout montrer', 'Show all')}</button>
          <button type="button" data-boutique-btn="on" aria-pressed={isBoutique(hidden.join(','))} onClick={() => save(parseHidden(boutiqueHidden()))} className={pill(isBoutique(hidden.join(',')))}>{t('Boutique', 'Shop')}</button>
        </div>
        <p className="text-[11px] text-slate-400">{t('« Boutique » garde Stock, Clients, Argent et Messages.', '"Shop" keeps Stock, Clients, Money and Messages.')}</p>
      </div>
      <div className="space-y-3">
        {MENU_ROWS.map(g => (
          <fieldset key={g.group} className="space-y-0.5" data-menu-pages-group={g.group}>
            <legend className="text-[11px] font-mono uppercase text-slate-400">{t(g.fr, g.en)}</legend>
            {g.rows.map(r => {
              const shown = !hidden.includes(r.hide);
              return (
                <label key={r.hide} className="flex items-center justify-between gap-3 min-h-[48px] text-sm text-slate-200 cursor-pointer">
                  <span>{t(r.fr, r.en)}{!shown && <span className="ml-2 text-[10px] font-mono text-amber-300">{t('cachée', 'hidden')}</span>}</span>
                  <input type="checkbox" role="switch" aria-checked={shown} checked={shown} data-menu-page={r.hide} onChange={e => toggle(r.hide, e.target.checked)} className="w-6 h-6 accent-emerald-500 shrink-0" />
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
      <p className="text-[11px] text-slate-400">{t(`Toujours affichées : ${ALWAYS_SHOWN.fr}.`, `Always shown: ${ALWAYS_SHOWN.en}.`)}</p>
      {err && <p className="text-sm text-rose-300" role="alert">{err}</p>}
    </section>
  );
};
