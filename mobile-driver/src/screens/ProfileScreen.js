import React, { useMemo } from 'react';
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
import { useDriver } from '../context/DriverContext';
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';

export default function ProfileScreen({ navigation }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { stats } = useDriver();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);

  const getInitials = () => {
    if (!user) return '?';
    return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  };

  const handleLogout = () => {
    Alert.alert(
      t('profile.logout') || 'Logout',
      t('profile.logoutConfirm') || 'Are you sure you want to logout?',
      [
        { text: t('common.cancel') || 'Cancel', style: 'cancel' },
        { text: t('profile.logout') || 'Logout', style: 'destructive', onPress: logout },
      ]
    );
  };

  const quickStats = [
    {
      id: 'earnings',
      icon: 'cash',
      value: `${stats.earnings?.toFixed(2) || '0.00'} ₾`,
      label: t('home.earnings'),
      color: colors.success,
    },
    {
      id: 'trips',
      icon: 'car',
      value: stats.trips || 0,
      label: t('home.trips'),
      color: colors.primary,
    },
    {
      id: 'rating',
      icon: 'star',
      value: stats.rating?.toFixed(1) || '0.0',
      label: t('profile.rating') || 'Rating',
      color: colors.gold,
    },
  ];

  const menuItems = [
    {
      id: 'rides',
      icon: 'car-outline',
      label: t('rides.myRides'),
      onPress: () => navigation.navigate('Rides'),
    },
    {
      id: 'earnings',
      icon: 'wallet-outline',
      label: t('earnings.title'),
      onPress: () => navigation.navigate('Earnings'),
    },
    {
      id: 'settings',
      icon: 'settings-outline',
      label: t('settings.title'),
      onPress: () => navigation.navigate('Settings'),
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing['3xl'] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.xl }]}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{getInitials()}</Text>
            </View>
            <View style={styles.onlineBadge}>
              <Ionicons name="checkmark" size={12} color={colors.primaryForeground} />
            </View>
          </View>

          <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {user?.firstName || 'Driver'} {user?.lastName || ''}
          </Text>
          <Text style={styles.email} numberOfLines={1}>{user?.email}</Text>

          {/* Rating */}
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={18} color={colors.gold} />
            <Text style={styles.ratingText}>{stats.rating?.toFixed(1) || '0.0'}</Text>
            <Text style={styles.reviewCount} numberOfLines={1}>
              ({stats.totalReviews || 0} {stats.totalReviews === 1 ? t('profile.review') : t('profile.reviews')})
            </Text>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle} numberOfLines={1}>{t('profile.stats') || 'YOUR STATS'}</Text>
          <View style={styles.statsGrid}>
            {quickStats.map((stat) => (
              <View key={stat.id} style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: `${stat.color}15` }]}>
                  <Ionicons name={stat.icon} size={22} color={stat.color} />
                </View>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{stat.value}</Text>
                <Text style={styles.statLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Account Info */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle} numberOfLines={1}>{t('profile.accountInfo') || 'ACCOUNT INFO'}</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <Ionicons name="mail-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel} numberOfLines={1}>{t('profile.emailLabel') || 'Email'}</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{user?.email || '-'}</Text>
              </View>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <Ionicons name="call-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel} numberOfLines={1}>{t('profile.phoneLabel') || 'Phone'}</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{user?.phone || t('profile.notProvided') || 'Not provided'}</Text>
              </View>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel} numberOfLines={1}>{t('profile.accountStatus') || 'Status'}</Text>
                <Text style={[styles.infoValue, { color: colors.success }]} numberOfLines={1}>
                  {t('profile.verified') || 'Verified Driver'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle} numberOfLines={1}>{t('profile.quickActions') || 'QUICK ACTIONS'}</Text>
          <View style={styles.menuContainer}>
            {menuItems.map((item, index) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.menuItem,
                  index !== menuItems.length - 1 && styles.menuItemBorder,
                ]}
                onPress={item.onPress}
              >
                <View style={styles.menuItemLeft}>
                  <View style={styles.menuIconContainer}>
                    <Ionicons name={item.icon} size={22} color={colors.primary} />
                  </View>
                  <Text style={styles.menuItemText} numberOfLines={1}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel={t('profile.logout') || 'Logout'}
        >
          <Ionicons name="log-out-outline" size={22} color={colors.destructive} />
          <Text style={styles.logoutText} numberOfLines={1}>{t('profile.logout') || 'Logout'}</Text>
        </TouchableOpacity>
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
    paddingBottom: spacing['3xl'],
  },
  header: {
    backgroundColor: colors.background,
    alignItems: 'center',
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius['2xl'],
    borderBottomRightRadius: radius['2xl'],
    ...shadows.sm,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.lg,
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
    fontWeight: '700',
    color: colors.primaryForeground,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  name: {
    ...typography.h1,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  email: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginBottom: spacing.md,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  ratingText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.foreground,
    marginLeft: spacing.xs,
  },
  reviewCount: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginLeft: spacing.xs,
  },
  statsSection: {
    padding: spacing.lg,
  },
  sectionTitle: {
    ...typography.label,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 2,
  },
  statLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  infoSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  infoCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.foreground,
  },
  infoDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  actionsSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  menuContainer: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  menuItemText: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.foreground,
    flex: 1,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.destructive}15`,
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  logoutText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.destructive,
  },
});
