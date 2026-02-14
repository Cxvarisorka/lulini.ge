import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useLanguage, LANGUAGES } from '../context/LanguageContext';
import { colors, shadows, radius, useTypography } from '../theme/colors';

// Country flag emoji helper
const FLAGS = {
  GB: 'GB',
  ES: 'ES',
  RU: 'RU',
  GE: 'GE',
};

export default function LanguageSelectScreen({ navigation }) {
const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
    const { t } = useTranslation();
  const { currentLanguage, changeLanguage } = useLanguage();

  const handleSelectLanguage = async (languageCode) => {
    await changeLanguage(languageCode);
    navigation.goBack();
  };

  const renderLanguageItem = ({ item }) => {
    const isSelected = currentLanguage === item.code;

    return (
      <TouchableOpacity
        style={[
          styles.languageItem,
          isSelected && styles.languageItemSelected,
        ]}
        onPress={() => handleSelectLanguage(item.code)}
      >
        <View style={styles.languageInfo}>
          <View style={styles.flagContainer}>
            <Text style={styles.flagText}>{getFlagEmoji(item.flag)}</Text>
          </View>
          <View style={styles.languageTextContainer}>
            <Text style={[
              styles.languageName,
              isSelected && styles.languageNameSelected,
            ]}>
              {item.nativeName}
            </Text>
            <Text style={styles.languageNameEn}>{item.name}</Text>
          </View>
        </View>
        {isSelected && (
          <View style={styles.checkContainer}>
            <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={LANGUAGES}
        renderItem={renderLanguageItem}
        keyExtractor={(item) => item.code}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

// Helper function to get flag emoji from country code
function getFlagEmoji(countryCode) {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  listContent: {
    padding: 16,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  languageItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  languageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  flagContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  flagText: {
    fontSize: 28,
  },
  languageTextContainer: {
    flex: 1,
  },
  languageName: {
    ...typography.h2,
    color: colors.foreground,
    marginBottom: 2,
  },
  languageNameSelected: {
    color: colors.primary,
  },
  languageNameEn: {
    ...typography.body,
    color: colors.mutedForeground,
  },
  checkContainer: {
    marginLeft: 12,
  },
  separator: {
    height: 12,
  },
});
