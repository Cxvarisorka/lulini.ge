import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';

export default function SettingsScreen({ navigation }) {
const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
    const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Settings state (in production, these would be persisted)
  const [settings, setSettings] = useState({
    darkMode: false,
    locationServices: true,
    autoDetectPickup: true,
    soundEffects: true,
    hapticFeedback: true,
    showETA: true,
    showLiveTracking: true,
    saveRideHistory: true,
  });

  const toggleSetting = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const settingsSections = [
    {
      title: t('settings.appearance'),
      items: [
        {
          icon: 'moon',
          label: t('settings.darkMode'),
          description: t('settings.darkModeDesc'),
          type: 'switch',
          key: 'darkMode',
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
      title: t('settings.ridePreferences'),
      items: [
        {
          icon: 'time',
          label: t('settings.showETA'),
          description: t('settings.showETADesc'),
          type: 'switch',
          key: 'showETA',
        },
        {
          icon: 'map',
          label: t('settings.liveTracking'),
          description: t('settings.liveTrackingDesc'),
          type: 'switch',
          key: 'showLiveTracking',
        },
        {
          icon: 'document-text',
          label: t('settings.saveRideHistory'),
          description: t('settings.saveRideHistoryDesc'),
          type: 'switch',
          key: 'saveRideHistory',
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
          onPress: () => {},
        },
        {
          icon: 'document',
          label: t('settings.termsOfService'),
          type: 'link',
          onPress: () => {},
        },
        {
          icon: 'trash',
          label: t('settings.deleteAccount'),
          type: 'danger',
          onPress: () => {},
        },
      ],
    },
  ];

  const renderSettingItem = (item, index, isLast) => {
    const isSwitch = item.type === 'switch';
    const isDanger = item.type === 'danger';

    return (
      <TouchableOpacity
        key={index}
        style={[styles.settingItem, !isLast && styles.settingItemBorder]}
        onPress={isSwitch ? () => toggleSetting(item.key) : item.onPress}
        activeOpacity={isSwitch ? 1 : 0.7}
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
          {item.description && (
            <Text style={styles.settingDescription}>{item.description}</Text>
          )}
        </View>
        {isSwitch ? (
          <Switch
            value={settings[item.key]}
            onValueChange={() => toggleSetting(item.key)}
            trackColor={{ false: colors.muted, true: colors.primary }}
            thumbColor={colors.background}
          />
        ) : (
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
            <Text style={styles.sectionTitle}>{section.title}</Text>
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

const createStyles = (typography) => StyleSheet.create({
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
