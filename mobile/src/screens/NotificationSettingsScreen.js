import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { radius, spacing, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

const NOTIFICATION_SETTINGS_KEY = '@notification_settings';

export default function NotificationSettingsScreen({ navigation }) {
const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);
    const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const defaultNotifSettings = {
    pushEnabled: true,
    rideUpdates: true,
    driverArrival: true,
    rideCompleted: true,
    promotions: false,
    news: false,
    paymentAlerts: true,
    supportResponses: true,
    soundEnabled: true,
    vibrationEnabled: true,
  };

  const [settings, setSettings] = useState(defaultNotifSettings);

  // Load persisted notification settings on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
        if (raw) setSettings((prev) => ({ ...prev, ...JSON.parse(raw) }));
      } catch {}
    })();
  }, []);

  const toggleSetting = useCallback((key) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const notificationSections = [
    {
      title: t('notifications.rideNotifications'),
      items: [
        {
          icon: 'car',
          label: t('notifications.rideUpdates'),
          description: t('notifications.rideUpdatesDesc'),
          key: 'rideUpdates',
        },
        {
          icon: 'location',
          label: t('notifications.driverArrival'),
          description: t('notifications.driverArrivalDesc'),
          key: 'driverArrival',
        },
        {
          icon: 'checkmark-circle',
          label: t('notifications.rideCompleted'),
          description: t('notifications.rideCompletedDesc'),
          key: 'rideCompleted',
        },
      ],
    },
    {
      title: t('notifications.accountNotifications'),
      items: [
        {
          icon: 'card',
          label: t('notifications.paymentAlerts'),
          description: t('notifications.paymentAlertsDesc'),
          key: 'paymentAlerts',
        },
        {
          icon: 'chatbubble',
          label: t('notifications.supportResponses'),
          description: t('notifications.supportResponsesDesc'),
          key: 'supportResponses',
        },
      ],
    },
    {
      title: t('notifications.marketingNotifications'),
      items: [
        {
          icon: 'gift',
          label: t('notifications.promotions'),
          description: t('notifications.promotionsDesc'),
          key: 'promotions',
        },
        {
          icon: 'newspaper',
          label: t('notifications.news'),
          description: t('notifications.newsDesc'),
          key: 'news',
        },
      ],
    },
    {
      title: t('notifications.alertPreferences'),
      items: [
        {
          icon: 'volume-high',
          label: t('notifications.sound'),
          description: t('notifications.soundDesc'),
          key: 'soundEnabled',
        },
        {
          icon: 'phone-portrait',
          label: t('notifications.vibration'),
          description: t('notifications.vibrationDesc'),
          key: 'vibrationEnabled',
        },
      ],
    },
  ];

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
        {/* Master Toggle */}
        <View style={styles.masterToggle}>
          <View style={styles.masterToggleContent}>
            <View style={styles.masterToggleIcon}>
              <Ionicons
                name={settings.pushEnabled ? 'notifications' : 'notifications-off'}
                size={24}
                color={settings.pushEnabled ? colors.primary : colors.mutedForeground}
              />
            </View>
            <View style={styles.masterToggleText}>
              <Text style={styles.masterToggleLabel}>
                {t('notifications.pushNotifications')}
              </Text>
              <Text style={styles.masterToggleDescription}>
                {settings.pushEnabled
                  ? t('notifications.enabled')
                  : t('notifications.disabled')}
              </Text>
            </View>
          </View>
          <Switch
            value={settings.pushEnabled}
            onValueChange={() => toggleSetting('pushEnabled')}
            trackColor={{ false: colors.muted, true: colors.primary }}
            thumbColor={colors.background}
          />
        </View>

        {/* Notification Sections */}
        {settings.pushEnabled &&
          notificationSections.map((section, sectionIndex) => (
            <View key={sectionIndex} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionContent}>
                {section.items.map((item, itemIndex) => (
                  <View
                    key={item.key}
                    style={[
                      styles.settingItem,
                      itemIndex !== section.items.length - 1 &&
                        styles.settingItemBorder,
                    ]}
                  >
                    <View style={styles.settingIcon}>
                      <Ionicons
                        name={item.icon}
                        size={20}
                        color={colors.foreground}
                      />
                    </View>
                    <View style={styles.settingContent}>
                      <Text style={styles.settingLabel}>{item.label}</Text>
                      <Text style={styles.settingDescription}>
                        {item.description}
                      </Text>
                    </View>
                    <Switch
                      value={settings[item.key]}
                      onValueChange={() => toggleSetting(item.key)}
                      trackColor={{ false: colors.muted, true: colors.primary }}
                      thumbColor={colors.background}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons
            name="information-circle"
            size={24}
            color={colors.info}
          />
          <Text style={styles.infoText}>
            {t('notifications.infoMessage')}
          </Text>
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
  masterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  masterToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  masterToggleIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  masterToggleText: {
    flex: 1,
  },
  masterToggleLabel: {
    ...typography.h2,
    color: colors.foreground,
  },
  masterToggleDescription: {
    ...typography.body,
    color: colors.mutedForeground,
    marginTop: 2,
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
    borderWidth: 1,
    borderColor: colors.border,
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingContent: {
    flex: 1,
    marginRight: spacing.md,
  },
  settingLabel: {
    ...typography.h3,
    color: colors.foreground,
  },
  settingDescription: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: `${colors.info}10`,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  infoText: {
    ...typography.body,
    flex: 1,
    color: colors.mutedForeground,
    marginLeft: spacing.md,
  },
});
