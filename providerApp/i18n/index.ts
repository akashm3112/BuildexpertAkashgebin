import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en';
import hi from './locales/hi';
import kn from './locales/kn';
import ta from './locales/ta';
import te from './locales/te';
import ml from './locales/ml';

export type Language = 'en' | 'hi' | 'kn' | 'ta' | 'te' | 'ml';

export const languages = {
  en: { name: 'English', nativeName: 'English' },
  hi: { name: 'Hindi', nativeName: 'हिंदी' },
  kn: { name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  ta: { name: 'Tamil', nativeName: 'தமிழ்' },
  te: { name: 'Telugu', nativeName: 'తెలుగు' },
  ml: { name: 'Malayalam', nativeName: 'മലയാളം' },
};

class I18n {
  private currentLanguage: Language = 'en';
  private translations: Record<Language, any> = {
    en,
    hi,
    kn,
    ta,
    te,
    ml,
  };

  async loadLanguage(): Promise<void> {
    try {
      const savedLanguage = await AsyncStorage.getItem('selectedLanguage');
      if (savedLanguage && this.translations[savedLanguage as Language]) {
        this.currentLanguage = savedLanguage as Language;
      }
    } catch (error) {
      console.error('Error loading language:', error);
    }
  }

  async setLanguage(language: Language): Promise<void> {
    if (this.translations[language]) {
      this.currentLanguage = language;
      try {
        await AsyncStorage.setItem('selectedLanguage', language);
      } catch (error) {
        console.error('Error saving language:', error);
      }
    }
  }

  getCurrentLanguage(): Language {
    return this.currentLanguage;
  }

  getCurrentLanguageName(): string {
    return languages[this.currentLanguage].nativeName;
  }

  t(key: string, params?: Record<string, string>): string {
    const keys = key.split('.');
    let value: any = this.translations[this.currentLanguage];

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Fallback to English if translation not found
        value = this.translations.en;
        for (const fallbackKey of keys) {
          if (value && typeof value === 'object' && fallbackKey in value) {
            value = value[fallbackKey];
          } else {
            return key; // Return the key if translation not found
          }
        }
        break;
      }
    }

    if (typeof value === 'string') {
      if (params) {
        return value.replace(/\{(\w+)\}/g, (match, param) => {
          return params[param] || match;
        });
      }
      return value;
    }

    return key;
  }

  getAvailableLanguages() {
    return languages;
  }
}

export const i18n = new I18n();
export const t = (key: string, params?: Record<string, string>) => i18n.t(key, params);

