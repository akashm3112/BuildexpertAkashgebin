import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en';
import hi from './locales/hi';
import kn from './locales/kn';
import ta from './locales/ta';
import te from './locales/te';
import ml from './locales/ml';

export type Language = 'en' | 'hi' | 'kn' | 'ta' | 'te' | 'ml';

export const languages = {
  en: { name: 'English', translations: en },
  hi: { name: 'Hindi', translations: hi },
  kn: { name: 'Kannada', translations: kn },
  ta: { name: 'Tamil', translations: ta },
  te: { name: 'Telugu', translations: te },
  ml: { name: 'Malayalam', translations: ml },
};

export const languageNames = {
  'English': 'en',
  'Hindi': 'hi',
  'Kannada': 'kn',
  'Tamil': 'ta',
  'Telugu': 'te',
  'Malayalam': 'ml',
};

class I18n {
  private currentLanguage: Language = 'en';
  private translations: any = languages.en.translations;

  constructor() {
    this.loadLanguage();
  }

  private async loadLanguage() {
    try {
      const savedLanguage = await AsyncStorage.getItem('selectedLanguage');
      if (savedLanguage && languages[savedLanguage as Language]) {
        this.setLanguage(savedLanguage as Language);
      }
    } catch (error) {
    }
  }

  public async setLanguage(language: Language) {
    if (languages[language]) {
      this.currentLanguage = language;
      this.translations = languages[language].translations;
      await AsyncStorage.setItem('selectedLanguage', language);
    }
  }

  public getCurrentLanguage(): Language {
    return this.currentLanguage;
  }

  public getCurrentLanguageName(): string {
    return languages[this.currentLanguage].name;
  }

  public t(key: string, params?: Record<string, string>): string {
    const keys = key.split('.');
    let value: any = this.translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Fallback to English if translation not found
        value = this.getFallbackValue(key);
        break;
      }
    }

    if (typeof value === 'string') {
      if (params) {
        return this.interpolate(value, params);
      }
      return value;
    }

    return key;
  }

  private getFallbackValue(key: string): string {
    const keys = key.split('.');
    let value: any = languages.en.translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return key;
      }
    }

    return typeof value === 'string' ? value : key;
  }

  private interpolate(text: string, params: Record<string, string>): string {
    return text.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key] || match;
    });
  }

  public getAvailableLanguages() {
    return Object.entries(languages).map(([code, lang]) => ({
      code: code as Language,
      name: lang.name,
    }));
  }
}

export const i18n = new I18n();

// Helper function to use translations
export const t = (key: string, params?: Record<string, string>) => i18n.t(key, params);
