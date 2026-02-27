import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ka from './locales/ka.json';

const resources = {
  en: { translation: en },
  ka: { translation: ka }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'ka',
    fallbackLng: 'ka',
    supportedLngs: ['en', 'ka'],
    interpolation: {
      escapeValue: false
    },
    react: {
      useSuspense: false
    }
  });

export default i18n;
