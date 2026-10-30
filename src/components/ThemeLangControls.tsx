import React from 'react';
import { Languages, Moon, Sun } from 'lucide-react';
import { useApp } from '../context/AppContext';

// Thème et langue, en petit (demande de BTK, 2026-10-29) : un interrupteur soleil / lune pour le thème, une petite liste pour la langue.
// Réglé sur cet appareil, enregistré tout de suite (AppContext). Même contrôle dans toutes les vues de Réglages.
export const ThemeLangControls: React.FC = () => {
  const { theme, toggleTheme, lang, setLang } = useApp();
  const dark = theme === 'dark';
  const row = 'flex items-center justify-between gap-3 min-h-[44px]';
  return (
    <div className="space-y-1">
      <div className={row}>
        <span className="text-sm text-slate-200">{lang === 'en' ? 'Theme' : 'Thème'}</span>
        <button type="button" role="switch" aria-checked={dark} onClick={toggleTheme}
          aria-label={dark ? (lang === 'en' ? 'Dark theme on: switch to light theme' : 'Thème sombre actif : passer au thème clair') : (lang === 'en' ? 'Light theme on: switch to dark theme' : 'Thème clair actif : passer au thème sombre')}
          className={`relative w-[60px] h-8 rounded-full border cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-500 shrink-0 ${dark ? 'bg-slate-800 border-slate-600' : 'bg-amber-100 border-amber-300'}`}>
          <Sun className={`absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 ${dark ? 'text-slate-500' : 'text-amber-500'}`} aria-hidden="true" />
          <Moon className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 ${dark ? 'text-sky-300' : 'text-slate-400'}`} aria-hidden="true" />
          <span className={`absolute top-0.5 w-6 h-6 rounded-full shadow flex items-center justify-center transition-all ${dark ? 'left-[32px] bg-slate-950' : 'left-0.5 bg-white'}`}>
            {dark ? <Moon className="w-3.5 h-3.5 text-sky-300" aria-hidden="true" /> : <Sun className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />}
          </span>
        </button>
      </div>
      <div className={row}>
        <label htmlFor="df-lang-select" className="text-sm text-slate-200 inline-flex items-center gap-1.5"><Languages className="w-4 h-4 text-slate-400" aria-hidden="true" />{lang === 'en' ? 'Language' : 'Langue'}</label>
        <select id="df-lang-select" value={lang} onChange={e => setLang(e.target.value === 'en' ? 'en' : 'fr')}
          className="min-h-[40px] rounded-lg border border-slate-600 bg-slate-900/60 text-slate-100 text-sm px-3 pr-8 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </div>
    </div>
  );
};
