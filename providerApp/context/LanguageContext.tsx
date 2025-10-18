import React, { createContext, useContext, useEffect, useState } from 'react';
import { i18n, Language, languages } from '@/i18n';

interface LanguageContextType {
  currentLanguage: Language;
  currentLanguageName: string;
  setLanguage: (language: Language) => Promise<void>;
  t: (key: string, params?: Record<string, string>) => string;
  availableLanguages: typeof languages;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

interface LanguageProviderProps {
  children: React.ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [currentLanguage, setCurrentLanguage] = useState<Language>('en');
  const [currentLanguageName, setCurrentLanguageName] = useState<string>('English');

  useEffect(() => {
    const initializeLanguage = async () => {
      await i18n.loadLanguage();
      const language = i18n.getCurrentLanguage();
      const languageName = i18n.getCurrentLanguageName();
      setCurrentLanguage(language);
      setCurrentLanguageName(languageName);
    };

    initializeLanguage();
  }, []);

  const setLanguage = async (language: Language) => {
    await i18n.setLanguage(language);
    const languageName = i18n.getCurrentLanguageName();
    setCurrentLanguage(language);
    setCurrentLanguageName(languageName);
  };

  const t = (key: string, params?: Record<string, string>) => {
    return i18n.t(key, params);
  };

  const value: LanguageContextType = {
    currentLanguage,
    currentLanguageName,
    setLanguage,
    t,
    availableLanguages: languages,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

