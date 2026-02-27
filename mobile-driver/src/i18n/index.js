import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';

import en from './locales/en.json';
import ka from './locales/ka.json';

// Get saved language from storage
const getStoredLanguage = async () => {
  try {
    return await SecureStore.getItemAsync('language') || 'ka';
  } catch (error) {
    return 'ka';
  }
};

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v3',
    resources: {
      en: { translation: en },
      ka: { translation: ka },
    },
    lng: 'ka',
    fallbackLng: 'ka',
    interpolation: {
      escapeValue: false,
    },
  });

// Load saved language
getStoredLanguage().then((lang) => {
  i18n.changeLanguage(lang);
});

export default i18n;
