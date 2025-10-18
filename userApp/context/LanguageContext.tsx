import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { i18n, Language } from '@/i18n';

interface LanguageContextType {
  currentLanguage: Language;
  currentLanguageName: string;
  setLanguage: (language: Language) => Promise<void>;
  t: (key: string, params?: Record<string, string>) => string;
  availableLanguages: { code: Language; name: string }[];
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
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [currentLanguage, setCurrentLanguage] = useState<Language>('en');
  const [currentLanguageName, setCurrentLanguageName] = useState<string>('English');

  useEffect(() => {
    // Initialize with current language from i18n
    setCurrentLanguage(i18n.getCurrentLanguage());
    setCurrentLanguageName(i18n.getCurrentLanguageName());
  }, []);

  const setLanguage = async (language: Language) => {
    await i18n.setLanguage(language);
    setCurrentLanguage(language);
    setCurrentLanguageName(i18n.getCurrentLanguageName());
  };

  const t = (key: string, params?: Record<string, string>) => {
    return i18n.t(key, params);
  };

  const availableLanguages = i18n.getAvailableLanguages();

  const value: LanguageContextType = {
    currentLanguage,
    currentLanguageName,
    setLanguage,
    t,
    availableLanguages,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};
