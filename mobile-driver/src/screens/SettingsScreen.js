import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import appConfig from '../../app.config';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useMap } from '../context/MapContext';
import { colors, shadows, radius, useTypography } from '../theme/colors';

export default function SettingsScreen({ navigation }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { getCurrentLanguageName } = useLanguage();
  const { getCurrentMapName } = useMap();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);

  const handleLogout = () => {
    Alert.alert(
      t('settings.logout'),
      t('settings.confirmLogout'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const sections = [
    {
      title: t('settings.appearance'),
      items: [
        {
          icon: 'language-outline',
          label: t('settings.language'),
          value: getCurrentLanguageName(),
          onPress: () => navigation.navigate('LanguageSelect'),
        },
        {
          icon: 'map-outline',
          label: t('settings.mapProvider'),
          value: getCurrentMapName(),
          onPress: () => navigation.navigate('MapSelect'),
        },
      ],
    },
    {
      title: t('settings.support'),
      items: [
        {
          icon: 'help-circle-outline',
          label: t('settings.helpCenter'),
          onPress: () => Linking.openURL('https://lulini.ge/support'),
        },
        {
          icon: 'document-text-outline',
          label: t('settings.termsOfService'),
          onPress: () => Linking.openURL('https://lulini.ge/terms'),
        },
        {
          icon: 'shield-checkmark-outline',
          label: t('settings.privacyPolicy'),
          onPress: () => Linking.openURL('https://lulini.ge/privacy'),
        },
      ],
    },
    {
      title: t('settings.about'),
      items: [
        {
          icon: 'information-circle-outline',
          label: t('settings.version'),
          value: appConfig.expo?.version || '1.0.0',
        },
      ],
    },
    {
      title: t('settings.account') || 'Account',
      items: [
        {
          icon: 'trash-outline',
          label: t('deleteAccount.title'),
          onPress: () => navigation.navigate('DeleteAccount'),
          destructive: true,
        },
      ],
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.back') || 'Go back'}
        >
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('settings.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        {sections.map((section, index) => (
          <View key={index} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionContent}>
              {section.items.map((item, itemIndex) => (
                <TouchableOpacity
                  key={itemIndex}
                  style={[
                    styles.menuItem,
                    itemIndex === section.items.length - 1 && styles.menuItemLast,
                  ]}
                  onPress={item.onPress}
                  disabled={!item.onPress}
                  accessibilityRole={item.onPress ? 'button' : 'none'}
                  accessibilityLabel={item.label + (item.value ? `, ${item.value}` : '')}
                  accessibilityHint={item.onPress && !item.value ? `Opens ${item.label}` : undefined}
                >
                  <View style={styles.menuItemLeft}>
                    <Ionicons
                      name={item.icon}
                      size={24}
                      color={item.destructive ? colors.destructive : colors.foreground}
                    />
                    <Text style={[
                      styles.menuItemText,
                      item.destructive && styles.menuItemTextDestructive,
                    ]}>
                      {item.label}
                    </Text>
                  </View>
                  <View style={styles.menuItemRight}>
                    {item.value && (
                      <Text style={styles.menuItemValue}>{item.value}</Text>
                    )}
                    {item.onPress && (
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={item.destructive ? colors.destructive : colors.mutedForeground}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel={t('settings.logout')}
        >
          <Ionicons name="log-out-outline" size={24} color={colors.destructive} />
          <Text style={styles.logoutButtonText}>{t('settings.logout')}</Text>
        </TouchableOpacity>
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
    width: 44,
    height: 44,
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginBottom: 12,
    marginLeft: 4,
  },
  sectionContent: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuItemText: {
    ...typography.body,
    color: colors.foreground,
    marginLeft: 12,
  },
  menuItemTextDestructive: {
    color: colors.destructive,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemValue: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginRight: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    marginTop: 12,
    marginBottom: 32,
    ...shadows.sm,
  },
  logoutButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.destructive,
    marginLeft: 8,
  },
});
