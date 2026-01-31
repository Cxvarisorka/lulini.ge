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
import { colors, shadows, radius, spacing } from '../theme/colors';

export default function SettingsScreen({ navigation }) {
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
          onPress: () => console.log('Privacy Policy'),
        },
        {
          icon: 'document',
          label: t('settings.termsOfService'),
          type: 'link',
          onPress: () => console.log('Terms of Service'),
        },
        {
          icon: 'trash',
          label: t('settings.deleteAccount'),
          type: 'danger',
          onPress: () => console.log('Delete Account'),
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
            color={isDanger ? colors.destructive : colors.foreground}
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
          <Text style={styles.appName}>GoTours Georgia</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 13,
    fontWeight: '600',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  sectionContent: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    ...shadows.sm,
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
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  settingIconDanger: {
    backgroundColor: `${colors.destructive}15`,
  },
  settingContent: {
    flex: 1,
    marginRight: spacing.md,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.foreground,
  },
  settingLabelDanger: {
    color: colors.destructive,
  },
  settingDescription: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  appName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  appVersion: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 4,
  },
});
