import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { shadows, radius, spacing, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { lightImpact, selectionFeedback, invalidateHapticsCache } from '../utils/haptics';
import { invalidateSoundCache } from '../utils/sounds';

const SETTINGS_STORAGE_KEY = '@app_settings';

export default function SettingsScreen({ navigation }) {
  const typography = useTypography();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { themePreference, setThemePreference, colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);

  const defaultSettings = {
    locationServices: true,
    autoDetectPickup: true,
    soundEffects: true,
    hapticFeedback: true,
  };

  const [settings, setSettings] = useState(defaultSettings);

  // Load persisted settings on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
        if (raw) setSettings((prev) => ({ ...prev, ...JSON.parse(raw) }));
      } catch {}
    })();
  }, []);

  const toggleSetting = useCallback((key) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      // Invalidate caches so haptics/sounds pick up the new preference immediately
      if (key === 'hapticFeedback') invalidateHapticsCache();
      if (key === 'soundEffects') invalidateSoundCache();
      return updated;
    });
    selectionFeedback();
  }, []);

  const handleThemeChange = useCallback((pref) => {
    setThemePreference(pref);
    lightImpact();
  }, [setThemePreference]);

  const comingSoon = () => Alert.alert(
    t('common.comingSoon', { defaultValue: 'Coming Soon' }),
    t('common.comingSoonDesc', { defaultValue: 'This feature is not available yet.' })
  );

  const themeOptions = [
    { value: 'light', icon: 'sunny-outline', label: t('settings.themeLight') },
    { value: 'dark',  icon: 'moon-outline',  label: t('settings.themeDark')  },
    { value: 'system',icon: 'phone-portrait-outline', label: t('settings.themeSystem') },
  ];

  const settingsSections = [
    {
      title: t('settings.appearance'),
      items: [
        {
          icon: 'contrast-outline',
          label: t('settings.darkMode'),
          description: t('settings.darkModeDesc'),
          type: 'theme',
        },
      ],
    },
    {
      title: t('settings.location'),
      items: [
        {
          icon: 'location',
          label: t('settings.locationServices'),
          description: t('settings.locationServicesDesc'),
          type: 'switch',
          key: 'locationServices',
        },
        {
          icon: 'navigate',
          label: t('settings.autoDetectPickup'),
          description: t('settings.autoDetectPickupDesc'),
          type: 'switch',
          key: 'autoDetectPickup',
        },
      ],
    },
    {
      title: t('settings.experience'),
      items: [
        {
          icon: 'volume-high',
          label: t('settings.soundEffects'),
          description: t('settings.soundEffectsDesc'),
          type: 'switch',
          key: 'soundEffects',
        },
        {
          icon: 'phone-portrait',
          label: t('settings.hapticFeedback'),
          description: t('settings.hapticFeedbackDesc'),
          type: 'switch',
          key: 'hapticFeedback',
        },
      ],
    },
    {
      title: t('settings.safety'),
      items: [
        {
          icon: 'people',
          label: t('emergencyContacts.title'),
          description: t('emergencyContacts.settingsDesc'),
          type: 'link',
          onPress: () => navigation.navigate('EmergencyContacts'),
        },
      ],
    },
    {
      title: t('settings.privacy'),
      items: [
        {
          icon: 'shield-checkmark',
          label: t('settings.privacyPolicy'),
          type: 'link',
          onPress: () => Linking.openURL('https://lulini.ge/privacy'),
        },
        {
          icon: 'document',
          label: t('settings.termsOfService'),
          type: 'link',
          onPress: () => Linking.openURL('https://lulini.ge/terms'),
        },
        {
          icon: 'trash',
          label: t('settings.deleteAccount'),
          type: 'danger',
          onPress: () => navigation.navigate('DeleteAccount'),
        },
      ],
    },
  ];

  const renderThemeSelector = () => (
    <View style={styles.themeSelector}>
      {themeOptions.map((opt) => {
        const isSelected = themePreference === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.themeOption, isSelected && styles.themeOptionSelected]}
            onPress={() => handleThemeChange(opt.value)}
            accessibilityRole="radio"
            accessibilityLabel={opt.label}
            accessibilityState={{ checked: isSelected }}
          >
            <Ionicons
              name={opt.icon}
              size={18}
              color={isSelected ? colors.primaryForeground : colors.foreground}
            />
            <Text style={[styles.themeOptionText, isSelected && styles.themeOptionTextSelected]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderSettingItem = (item, index, isLast) => {
    const isSwitch = item.type === 'switch';
    const isTheme  = item.type === 'theme';
    const isDanger = item.type === 'danger';

    return (
      <TouchableOpacity
        key={index}
        style={[styles.settingItem, !isLast && styles.settingItemBorder, isTheme && styles.settingItemTheme]}
        onPress={isSwitch ? () => toggleSetting(item.key) : isTheme ? undefined : item.onPress}
        activeOpacity={isSwitch || isTheme ? 1 : 0.7}
        accessibilityRole={isSwitch ? 'switch' : isDanger ? 'button' : isTheme ? 'none' : 'button'}
        accessibilityLabel={item.label}
        accessibilityHint={item.description}
        accessibilityState={isSwitch ? { checked: settings[item.key] } : undefined}
      >
        <View
          style={[
            styles.settingIcon,
            isDanger && styles.settingIconDanger,
          ]}
        >
          <Ionicons
            name={item.icon}
            size={20}
            color={isDanger ? colors.destructive : colors.primary}
          />
        </View>
        <View style={styles.settingContent}>
          <Text
            style={[
              styles.settingLabel,
              isDanger && styles.settingLabelDanger,
            ]}
          >
            {item.label}
          </Text>
          {item.description && !isTheme && (
            <Text style={styles.settingDescription}>{item.description}</Text>
          )}
          {isTheme && renderThemeSelector()}
        </View>
        {isSwitch ? (
          <Switch
            value={settings[item.key]}
            onValueChange={() => toggleSetting(item.key)}
            trackColor={{ false: colors.muted, true: colors.primary }}
            thumbColor={colors.background}
            accessibilityLabel={item.label}
            accessibilityRole="switch"
            accessibilityState={{ checked: settings[item.key] }}
          />
        ) : isTheme ? null : (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.mutedForeground}
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {settingsSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text
              style={styles.sectionTitle}
              accessibilityRole="header"
            >
              {section.title}
            </Text>
            <View style={styles.sectionContent}>
              {section.items.map((item, itemIndex) =>
                renderSettingItem(
                  item,
                  itemIndex,
                  itemIndex === section.items.length - 1
                )
              )}
            </View>
          </View>
        ))}

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appName}>Lulini</Text>
          <Text style={styles.appVersion}>Version {Constants.expoConfig?.version || '1.0.0'}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (typography, colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  sectionContent: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  settingItemTheme: {
    alignItems: 'flex-start',
  },
  settingItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  settingIconDanger: {
    backgroundColor: colors.background,
  },
  settingContent: {
    flex: 1,
    marginRight: spacing.md,
  },
  settingLabel: {
    ...typography.h3,
    color: colors.foreground,
  },
  settingLabelDanger: {
    color: colors.destructive,
  },
  settingDescription: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  themeSelector: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.muted,
    gap: 4,
  },
  themeOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  themeOptionText: {
    ...typography.captionSmall,
    color: colors.foreground,
    textAlign: 'center',
  },
  themeOptionTextSelected: {
    color: colors.primaryForeground,
    fontWeight: '600',
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  appName: {
    ...typography.h2,
    color: colors.foreground,
  },
  appVersion: {
    ...typography.body,
    color: colors.mutedForeground,
    marginTop: 4,
  },
});
