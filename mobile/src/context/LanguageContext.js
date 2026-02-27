import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useTranslation } from 'react-i18next';
import '../i18n';

const LanguageContext = createContext({});

export const useLanguage = () => useContext(LanguageContext);

export const LANGUAGES = [
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული', flag: 'GE' },
  { code: 'en', name: 'English', nativeName: 'English', flag: 'GB' },
];

export const LanguageProvider = ({ children }) => {
  const { i18n } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = useState('ka');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSavedLanguage();
  }, []);

  const loadSavedLanguage = async () => {
    try {
      const savedLanguage = await SecureStore.getItemAsync('language');
      if (savedLanguage && LANGUAGES.find(l => l.code === savedLanguage)) {
        setCurrentLanguage(savedLanguage);
        await i18n.changeLanguage(savedLanguage);
      }
    } catch (error) {
      // Error loading language
    } finally {
      setLoading(false);
    }
  };

  const changeLanguage = async (languageCode) => {
    try {
      await SecureStore.setItemAsync('language', languageCode);
      await i18n.changeLanguage(languageCode);
      setCurrentLanguage(languageCode);
    } catch (error) {
      // Error changing language
    }
  };

  const getCurrentLanguageInfo = () => {
    return LANGUAGES.find(l => l.code === currentLanguage) || LANGUAGES[0];
  };

  return (
    <LanguageContext.Provider
      value={{
        currentLanguage,
        changeLanguage,
        languages: LANGUAGES,
        getCurrentLanguageInfo,
        loading,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};
