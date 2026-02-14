import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLanguage } from '../context/LanguageContext';
import { colors, shadows, radius, useTypography } from '../theme/colors';

export default function LanguageSelectScreen({ navigation }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { currentLanguage, changeLanguage, languages } = useLanguage();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);

  const handleLanguageSelect = async (languageCode) => {
    await changeLanguage(languageCode);
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('settings.language')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        {languages.map((language) => (
          <TouchableOpacity
            key={language.code}
            style={[
              styles.languageItem,
              currentLanguage === language.code && styles.languageItemActive,
            ]}
            onPress={() => handleLanguageSelect(language.code)}
          >
            <View>
              <Text style={styles.languageName}>{language.nativeName}</Text>
              <Text style={styles.languageNameEn}>{language.name}</Text>
            </View>
            {currentLanguage === language.code && (
              <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    ...typography.h2,
    color: colors.foreground,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
    ...shadows.sm,
  },
  languageItemActive: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  languageName: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
  },
  languageNameEn: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginTop: 2,
  },
});
