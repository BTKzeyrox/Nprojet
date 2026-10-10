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
    return saved === 'light' ? 'light' : 'dark';
  });

  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('delta_lang');
    return saved === 'zh' ? 'zh' : 'fr';
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

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
