import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translations
import en from './locales/en.json';
import es from './locales/es.json';
import ru from './locales/ru.json';
import ka from './locales/ka.json';

const resources = {
  en: { translation: en },
  es: { translation: es },
  ru: { translation: ru },
  ka: { translation: ka },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'ka', // default language
    fallbackLng: 'ka',
    supportedLngs: ['en', 'es', 'ru', 'ka'],
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
