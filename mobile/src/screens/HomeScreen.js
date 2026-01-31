import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext';
import { useDrawer } from '../navigation/AppNavigator';
import { colors, shadows, radius, spacing } from '../theme/colors';

export default function HomeScreen({ navigation }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { openDrawer } = useDrawer();
  const insets = useSafeAreaInsets();

  const quickActions = [
    {
      id: 'taxi',
      icon: 'car',
      color: colors.primary,
      label: t('home.callTaxi'),
      screen: 'Taxi',
    },
    {
      id: 'rides',
      icon: 'time',
      color: colors.success,
      label: t('home.myRides'),
      screen: 'TaxiHistory',
    },
    {
      id: 'payment',
      icon: 'card',
      color: colors.info,
      label: t('drawer.paymentSettings'),
      screen: 'PaymentSettings',
    },
  ];

  const services = [
    {
      id: 'taxi',
      icon: 'car-sport',
      title: t('home.bookTaxi'),
      subtitle: t('home.taxiSubtitle'),
      screen: 'Taxi',
      primary: true,
    },
    {
      id: 'history',
      icon: 'time',
      title: t('taxi.rideHistory'),
      subtitle: t('taxi.noRidesDesc'),
      screen: 'TaxiHistory',
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { 
            paddingTop: insets.top + spacing.md,
            paddingBottom: insets.bottom + spacing.xl + 80,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={openDrawer}
          >
            <Ionicons name="menu" size={26} color={colors.foreground} />
          </TouchableOpacity>
          <View style={styles.welcomeContent}>
            <Text style={styles.greeting}>
              {t('home.greeting')}, {user?.firstName || t('home.guest')}
            </Text>
            <Text style={styles.subGreeting}>{t('home.whereToGo')}</Text>
          </View>
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => navigation.navigate('Profile')}
          >
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={24} color={colors.primaryForeground} />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Main CTA Card */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.ctaCard}
            onPress={() => navigation.navigate('Taxi')}
            activeOpacity={0.9}
          >
            <View style={styles.ctaContent}>
              <View style={styles.ctaIconBadge}>
                <Ionicons name="car-sport" size={24} color={colors.primaryForeground} />
              </View>
              <Text style={styles.ctaTitle}>{t('home.bookTaxi')}</Text>
              <Text style={styles.ctaSubtitle}>{t('home.taxiSubtitle')}</Text>
              <View style={styles.ctaButton}>
                <Text style={styles.ctaButtonText}>{t('home.requestRide')}</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.primaryForeground} />
              </View>
            </View>
            <View style={styles.ctaDecoration}>
              <Ionicons name="car-sport" size={120} color="rgba(255,255,255,0.1)" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('home.quickActions')}</Text>
          <View style={styles.quickActionsGrid}>
            {quickActions.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={styles.quickActionCard}
                onPress={() => navigation.navigate(action.screen)}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: `${action.color}15` }]}>
                  <Ionicons name={action.icon} size={24} color={action.color} />
                </View>
                <Text style={styles.quickActionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Services */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('home.ourFleet')}</Text>
          <View style={styles.servicesContainer}>
            {services.map((service, index) => (
              <TouchableOpacity
                key={service.id}
                style={[
                  styles.serviceItem,
                  index !== services.length - 1 && styles.serviceItemBorder,
                ]}
                onPress={() => navigation.navigate(service.screen)}
              >
                <View style={[
                  styles.serviceIcon,
                  service.primary && styles.serviceIconPrimary,
                ]}>
                  <Ionicons
                    name={service.icon}
                    size={22}
                    color={service.primary ? colors.primaryForeground : colors.foreground}
                  />
                </View>
                <View style={styles.serviceContent}>
                  <Text style={styles.serviceTitle}>{service.title}</Text>
                  <Text style={styles.serviceSubtitle} numberOfLines={1}>
                    {service.subtitle}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Support Card */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.supportCard}
            onPress={() => navigation.navigate('Support')}
          >
            <View style={styles.supportIcon}>
              <Ionicons name="help-buoy" size={24} color={colors.info} />
            </View>
            <View style={styles.supportContent}>
              <Text style={styles.supportTitle}>{t('drawer.helpCenter')}</Text>
              <Text style={styles.supportSubtitle}>{t('support.available247')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
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
  },
  welcomeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  menuButton: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  welcomeContent: {
    flex: 1,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  subGreeting: {
    fontSize: 15,
    color: colors.mutedForeground,
  },
  avatarButton: {
    marginLeft: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
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
  ctaCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  ctaContent: {
    zIndex: 1,
  },
  ctaIconBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  ctaTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primaryForeground,
    marginBottom: spacing.xs,
  },
  ctaSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  ctaButtonText: {
    color: colors.primaryForeground,
    fontWeight: '600',
    fontSize: 15,
  },
  ctaDecoration: {
    position: 'absolute',
    right: -30,
    bottom: -30,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadows.sm,
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  quickActionLabel: {
    fontSize: 13,
    color: colors.foreground,
    fontWeight: '500',
    textAlign: 'center',
  },
  servicesContainer: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  serviceItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  serviceIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  serviceIconPrimary: {
    backgroundColor: colors.primary,
  },
  serviceContent: {
    flex: 1,
  },
  serviceTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
  },
  serviceSubtitle: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  supportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  supportIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: `${colors.info}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  supportContent: {
    flex: 1,
  },
  supportTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
  },
  supportSubtitle: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 2,
  },
});
