import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, darkColors } from '../theme/colors';

const THEME_STORAGE_KEY = '@app_theme_preference';

// 'light' | 'dark' | 'system'
export const ThemeContext = createContext({
  themePreference: 'system',
  isDark: false,
  colors: colors,
  setThemePreference: () => {},
});

export function ThemeProvider({ children }) {
  const systemColorScheme = useColorScheme();
  const [themePreference, setThemePreferenceState] = useState('system');
  const [loaded, setLoaded] = useState(false);

  // Load persisted preference on mount
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setThemePreferenceState(stored);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setThemePreference = useCallback((pref) => {
    setThemePreferenceState(pref);
    AsyncStorage.setItem(THEME_STORAGE_KEY, pref).catch(() => {});
  }, []);

  // Resolve actual dark/light based on preference + system
  const isDark =
    themePreference === 'dark' ||
    (themePreference === 'system' && systemColorScheme === 'dark');

  // Memoize the context value so consumers only re-render when isDark or themePreference actually change
  const value = useMemo(() => ({
    themePreference,
    isDark,
    colors: isDark ? darkColors : colors,
    setThemePreference,
  }), [themePreference, isDark, setThemePreference]);

  // Don't render children until we know the user's stored preference
  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
