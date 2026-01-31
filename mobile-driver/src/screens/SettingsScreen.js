import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useMap } from '../context/MapContext';
import { colors, shadows, radius } from '../theme/colors';

export default function SettingsScreen({ navigation }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { getCurrentLanguageName } = useLanguage();
  const { getCurrentMapName } = useMap();

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
        },
        {
          icon: 'document-text-outline',
          label: t('settings.termsOfService'),
        },
        {
          icon: 'shield-checkmark-outline',
          label: t('settings.privacyPolicy'),
        },
      ],
    },
    {
      title: t('settings.about'),
      items: [
        {
          icon: 'information-circle-outline',
          label: t('settings.version'),
          value: '1.0.0',
        },
      ],
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
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
                >
                  <View style={styles.menuItemLeft}>
                    <Ionicons name={item.icon} size={24} color={colors.foreground} />
                    <Text style={styles.menuItemText}>{item.label}</Text>
                  </View>
                  <View style={styles.menuItemRight}>
                    {item.value && (
                      <Text style={styles.menuItemValue}>{item.value}</Text>
                    )}
                    {item.onPress && (
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={colors.mutedForeground}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color={colors.destructive} />
          <Text style={styles.logoutButtonText}>{t('settings.logout')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 18,
    fontWeight: '600',
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
    fontSize: 14,
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
    fontSize: 16,
    color: colors.foreground,
    marginLeft: 12,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemValue: {
    fontSize: 14,
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
    fontSize: 16,
    fontWeight: '600',
    color: colors.destructive,
    marginLeft: 8,
  },
});
