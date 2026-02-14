import React, { createContext, useState, useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};

const LANGUAGES = [
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
];

export const LanguageProvider = ({ children }) => {
  const { i18n } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = useState('ka');

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const savedLanguage = await SecureStore.getItemAsync('language');
      if (savedLanguage) {
        setCurrentLanguage(savedLanguage);
        i18n.changeLanguage(savedLanguage);
      }
    } catch (error) {
      // Failed to load language preference
    }
  };

  const changeLanguage = async (languageCode) => {
    try {
      await SecureStore.setItemAsync('language', languageCode);
      await i18n.changeLanguage(languageCode);
      setCurrentLanguage(languageCode);
    } catch (error) {
      // Failed to change language
    }
  };

  const getCurrentLanguageName = () => {
    const language = LANGUAGES.find((lang) => lang.code === currentLanguage);
    return language ? language.nativeName : 'ქართული';
  };

  const value = {
    currentLanguage,
    changeLanguage,
    languages: LANGUAGES,
    getCurrentLanguageName,
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
