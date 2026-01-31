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
import { colors, shadows, radius, spacing } from '../theme/colors';

export default function DrawerContent({ navigation }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();

  const menuSections = [
    {
      title: t('drawer.taxiServices'),
      items: [
        {
          icon: 'car',
          label: t('drawer.bookRide'),
          onPress: () => {
            navigation.closeDrawer();
            navigation.navigate('Taxi');
          },
        },
        {
          icon: 'time',
          label: t('drawer.rideHistory'),
          onPress: () => {
            navigation.closeDrawer();
            navigation.navigate('TaxiHistory');
          },
        },
        {
          icon: 'card',
          label: t('drawer.paymentSettings'),
          onPress: () => {
            navigation.closeDrawer();
            navigation.navigate('PaymentSettings');
          },
        },
      ],
    },
    {
      title: t('drawer.support'),
      items: [
        {
          icon: 'help-circle',
          label: t('drawer.helpCenter'),
          onPress: () => {
            navigation.closeDrawer();
            navigation.navigate('Support');
          },
        },
        {
          icon: 'chatbubbles',
          label: t('drawer.supportHistory'),
          onPress: () => {
            navigation.closeDrawer();
            navigation.navigate('SupportHistory');
          },
        },
        {
          icon: 'information-circle',
          label: t('drawer.about'),
          onPress: () => {
            navigation.closeDrawer();
            navigation.navigate('About');
          },
        },
      ],
    },
    {
      title: t('drawer.settings'),
      items: [
        {
          icon: 'settings',
          label: t('drawer.appSettings'),
          onPress: () => {
            navigation.closeDrawer();
            navigation.navigate('Settings');
          },
        },
        {
          icon: 'language',
          label: t('drawer.language'),
          onPress: () => {
            navigation.closeDrawer();
            navigation.navigate('LanguageSelect');
          },
        },
        {
          icon: 'notifications',
          label: t('drawer.notifications'),
          onPress: () => {
            navigation.closeDrawer();
            navigation.navigate('NotificationSettings');
          },
        },
      ],
    },
  ];

  const handleLogout = async () => {
    navigation.closeDrawer();
    await logout();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* User Profile Header */}
      <TouchableOpacity
        style={styles.profileSection}
        onPress={() => {
          navigation.closeDrawer();
          navigation.navigate('MainTabs', { screen: 'Profile' });
        }}
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
          <Text style={styles.statValue}>{user?.totalRides || 0}</Text>
          <Text style={styles.statLabel}>{t('drawer.totalRides')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{user?.rating || '5.0'}</Text>
          <Text style={styles.statLabel}>{t('drawer.rating')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Ionicons
            name={user?.isVerified ? 'checkmark-circle' : 'alert-circle'}
            size={20}
            color={user?.isVerified ? colors.success : colors.warning}
          />
          <Text style={styles.statLabel}>
            {user?.isVerified ? t('drawer.verified') : t('drawer.unverified')}
          </Text>
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

const styles = StyleSheet.create({
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
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
  },
  statLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
  },
  menuContainer: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  menuSection: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    fontSize: 15,
    color: colors.foreground,
    fontWeight: '500',
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
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
  },
  promoSubtitle: {
    fontSize: 13,
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
    fontSize: 15,
    color: colors.destructive,
    fontWeight: '500',
    marginLeft: spacing.sm,
  },
  versionText: {
    fontSize: 12,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
