import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
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

  const changeLanguage = useCallback(async (languageCode) => {
    try {
      await SecureStore.setItemAsync('language', languageCode);
      await i18n.changeLanguage(languageCode);
      setCurrentLanguage(languageCode);
    } catch (error) {
      // Error changing language
    }
  }, [i18n]);

  // H6: Wrap in useCallback so consumers with dependency arrays get stable reference
  const getCurrentLanguageInfo = useCallback(() => {
    return LANGUAGES.find(l => l.code === currentLanguage) || LANGUAGES[0];
  }, [currentLanguage]);

  // H6: Memoize context value
  const value = useMemo(() => ({
    currentLanguage,
    changeLanguage,
    languages: LANGUAGES,
    getCurrentLanguageInfo,
    loading,
  }), [currentLanguage, changeLanguage, getCurrentLanguageInfo, loading]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};
