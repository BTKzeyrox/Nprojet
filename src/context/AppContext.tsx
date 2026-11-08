// Contexte global de l'appli : thème clair ou sombre, langue FR ou EN, traduction t(clé) et animation de déconnexion.
// Utilisé par : App.tsx, AiSettingsSection.tsx, AssistantChat.tsx, BadgeCongrats.tsx, 66 autres. Contrôlé par : npm run check:page et 29 autres commandes check.
// Pour modifier : thème et langue sont gardés dans le navigateur (delta_theme, delta_lang) ; les clés de t(clé) sont dans utils/i18n.ts ; useLang() marche même sans fournisseur.
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, TranslationKey, getTranslation } from '../utils/i18n';

export type Theme = 'dark' | 'light';

interface AppContextType {
  theme: Theme;
  lang: Language;
  toggleTheme: () => void;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  isLoggingOut: boolean;
  startLogoutAnimation: (callback: () => void) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('delta_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('delta_lang');
    return saved === 'en' ? 'en' : 'fr';
  });

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    localStorage.setItem('delta_theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('theme-light');
      document.documentElement.classList.remove('theme-dark');
    } else {
      document.documentElement.classList.add('theme-dark');
      document.documentElement.classList.remove('theme-light');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('delta_lang', lang);
  }, [lang]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setLang = (newLang: Language) => {
    setLangState(newLang);
  };

  const t = (key: TranslationKey) => {
    return getTranslation(lang, key);
  };

  const startLogoutAnimation = (callback: () => void) => {
    setIsLoggingOut(true);
    setTimeout(() => {
      callback();
      setIsLoggingOut(false);
    }, 450);
  };

  return (
    <AppContext.Provider
      value={{
        theme,
        lang,
        toggleTheme,
        setLang,
        t,
        isLoggingOut,
        startLogoutAnimation,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

/** La langue seule, sans exiger le fournisseur (petits composants posés dans des pages essayées seules) : français si absent. */
export const useLang = (): 'fr' | 'en' => (useContext(AppContext)?.lang === 'en' ? 'en' : 'fr');

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
