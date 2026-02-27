import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { colors, radius, spacing, useTypography } from '../theme/colors';

export default function DrawerContent({ navigation }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);

  const menuSections = [
    {
      title: t('drawer.taxiServices'),
      items: [
        {
          icon: 'car',
          label: t('drawer.bookRide'),
          onPress: () => navigation.navigate('Taxi'),
        },
        {
          icon: 'time',
          label: t('drawer.rideHistory'),
          onPress: () => navigation.navigate('TaxiHistory'),
        },
        {
          icon: 'card',
          label: t('drawer.paymentSettings'),
          onPress: () => navigation.navigate('PaymentSettings'),
        },
      ],
    },
    {
      title: t('drawer.support'),
      items: [
        {
          icon: 'help-circle',
          label: t('drawer.helpCenter'),
          onPress: () => navigation.navigate('Support'),
        },
        {
          icon: 'chatbubbles',
          label: t('drawer.supportHistory'),
          onPress: () => navigation.navigate('SupportHistory'),
        },
        {
          icon: 'information-circle',
          label: t('drawer.about'),
          onPress: () => navigation.navigate('About'),
        },
      ],
    },
    {
      title: t('drawer.settings'),
      items: [
        {
          icon: 'settings',
          label: t('drawer.appSettings'),
          onPress: () => navigation.navigate('Settings'),
        },
        {
          icon: 'language',
          label: t('drawer.language'),
          onPress: () => navigation.navigate('LanguageSelect'),
        },
        {
          icon: 'notifications',
          label: t('drawer.notifications'),
          onPress: () => navigation.navigate('NotificationSettings'),
        },
      ],
    },
  ];

  const handleLogout = async () => {
    navigation.closeDrawer();
    // Small delay to let drawer close before logout unmounts everything
    setTimeout(() => logout(), 300);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* User Profile Header */}
      <TouchableOpacity
        style={styles.profileSection}
        onPress={() => navigation.navigate('MainTabs', { screen: 'Profile' })}
      >
        <View style={styles.avatarContainer}>
          {user?.profileImage ? (
            <Image source={{ uri: user.profileImage }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={32} color={colors.primaryForeground} />
            </View>
          )}
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.userName}>
            {user?.firstName && user?.lastName
              ? `${user.firstName} ${user.lastName}`
              : user?.firstName || t('home.guest')}
          </Text>
          <Text style={styles.userEmail}>{user?.email || ''}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
      </TouchableOpacity>

      {/* Quick Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <View style={styles.statIconValue}>
            <Ionicons name="car" size={18} color={colors.primary} />
            <Text style={styles.statValue}>{user?.totalRides || 0}</Text>
          </View>
          <Text style={styles.statLabel}>{t('drawer.totalRides')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <View style={styles.statIconValue}>
            <Ionicons name="star" size={18} color={colors.primary} />
            <Text style={styles.statValue}>{user?.rating || '5.0'}</Text>
          </View>
          <Text style={styles.statLabel}>{t('drawer.rating')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <View style={styles.statIconValue}>
            <Ionicons
              name={user?.isVerified ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={user?.isVerified ? colors.success : colors.warning}
            />
            <Text style={styles.statValue}>
              {user?.isVerified ? t('drawer.verified') : t('drawer.unverified')}
            </Text>
          </View>
        </View>
      </View>

      {/* Menu Sections */}
      <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
        {menuSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.menuSection}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item, itemIndex) => (
              <TouchableOpacity
                key={itemIndex}
                style={styles.menuItem}
                onPress={item.onPress}
              >
                <View style={styles.menuItemIcon}>
                  <Ionicons name={item.icon} size={22} color={colors.foreground} />
                </View>
                <Text style={styles.menuItemLabel}>{item.label}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            ))}
          </View>
        ))}

        {/* Promotions Card */}
        <TouchableOpacity style={styles.promoCard}>
          <View style={styles.promoContent}>
            <Ionicons name="gift" size={24} color={colors.primary} />
            <View style={styles.promoText}>
              <Text style={styles.promoTitle}>{t('drawer.inviteFriends')}</Text>
              <Text style={styles.promoSubtitle}>{t('drawer.earnRewards')}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </ScrollView>

      {/* Logout Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color={colors.destructive} />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </TouchableOpacity>
        <Text style={styles.versionText}>v1.0.0</Text>
      </View>
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.muted,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.lg,
  },
  avatarContainer: {
    marginRight: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  userName: {
    ...typography.h1,
    color: colors.foreground,
    marginBottom: 2,
  },
  userEmail: {
    ...typography.body,
    color: colors.mutedForeground,
  },
  statsContainer: {
    flexDirection: 'column',
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  statIconValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statValue: {
    ...typography.h3,
    fontWeight: '600',
    color: colors.foreground,
  },
  statLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
  },
  statDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  menuContainer: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  menuSection: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  menuItemIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  menuItemLabel: {
    flex: 1,
    ...typography.bodyMedium,
    color: colors.foreground,
  },
  promoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  promoContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  promoText: {
    marginLeft: spacing.md,
  },
  promoTitle: {
    ...typography.h3,
    color: colors.foreground,
  },
  promoSubtitle: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  logoutText: {
    ...typography.bodyMedium,
    color: colors.destructive,
    marginLeft: spacing.sm,
  },
  versionText: {
    ...typography.caption,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
