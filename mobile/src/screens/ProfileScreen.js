import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { colors, shadows, radius } from '../theme/colors';

export default function ProfileScreen({ navigation }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { getCurrentLanguageInfo } = useLanguage();

  const currentLang = getCurrentLanguageInfo();

  const handleLogout = () => {
    Alert.alert(
      t('profile.logout'),
      t('profile.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.logout'), style: 'destructive', onPress: logout },
      ]
    );
  };

  const getInitials = () => {
    if (!user) return '?';
    return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <Text>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          {user.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{getInitials()}</Text>
            </View>
          )}
        </View>
        <Text style={styles.name}>{user.firstName} {user.lastName}</Text>
        <Text style={styles.email}>{user.email}</Text>
        {user.role === 'admin' && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('profile.admin')}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.accountInfo')}</Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="mail-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>{t('profile.emailLabel')}</Text>
              <Text style={styles.infoValue}>{user.email}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="call-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>{t('profile.phoneLabel')}</Text>
              <Text style={styles.infoValue}>{user.phone || t('profile.notProvided')}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>{t('profile.accountStatus')}</Text>
              <Text style={[styles.infoValue, { color: user.isVerified ? colors.success : colors.warning }]}>
                {user.isVerified ? t('profile.verified') : t('profile.unverified')}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>{t('profile.memberSince')}</Text>
              <Text style={styles.infoValue}>{formatDate(user.createdAt)}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="key-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>{t('profile.loginProvider')}</Text>
              <Text style={styles.infoValue}>
                {user.provider === 'local' ? t('profile.emailPassword') :
                 user.provider?.charAt(0).toUpperCase() + user.provider?.slice(1)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.quickActions')}</Text>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('TaxiHistory')}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="car-outline" size={24} color={colors.primary} />
            <Text style={styles.actionText}>{t('profile.myRides')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Taxi')}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
            <Text style={styles.actionText}>{t('profile.bookTaxi')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.settings')}</Text>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('LanguageSelect')}
        >
          <View style={styles.actionLeft}>
            <Ionicons name="language-outline" size={24} color={colors.primary} />
            <Text style={styles.actionText}>{t('profile.language')}</Text>
          </View>
          <View style={styles.actionRight}>
            <Text style={styles.languageText}>{currentLang.nativeName}</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={24} color={colors.destructive} />
        <Text style={styles.logoutText}>{t('profile.logout')}</Text>
      </TouchableOpacity>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.secondary,
  },
  header: {
    backgroundColor: colors.background,
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomLeftRadius: radius['2xl'],
    borderBottomRightRadius: radius['2xl'],
    ...shadows.md,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.primaryForeground,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  badge: {
    backgroundColor: colors.secondary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginTop: 8,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: 16,
    ...shadows.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    color: colors.foreground,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  actionButton: {
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: radius.lg,
    marginBottom: 8,
    ...shadows.sm,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 16,
    color: colors.foreground,
    marginLeft: 12,
    fontWeight: '500',
  },
  actionRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  languageText: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginRight: 4,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.destructive + '10',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: radius.lg,
    marginTop: 8,
  },
  logoutText: {
    fontSize: 16,
    color: colors.destructive,
    fontWeight: '600',
    marginLeft: 8,
  },
  bottomPadding: {
    height: 32,
  },
});
