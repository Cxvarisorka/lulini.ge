import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext';
import { colors, shadows, radius } from '../theme/colors';

const QUICK_ACTIONS = [
  { id: 'taxi', icon: 'car', color: colors.primary, screen: 'Taxi' },
  { id: 'rides', icon: 'time', color: colors.success, screen: 'TaxiHistory' },
  { id: 'profile', icon: 'person', color: colors.warning, screen: 'Profile' },
];

const VEHICLE_TYPES = [
  { id: 'economy', icon: 'car-outline', priceFrom: 5 },
  { id: 'comfort', icon: 'car', priceFrom: 8 },
  { id: 'business', icon: 'car-sport', priceFrom: 12 },
];

export default function HomeScreen({ navigation }) {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.greeting}>
            {t('home.greeting')}, {user?.firstName || t('home.guest')}
          </Text>
          <Text style={styles.subGreeting}>{t('home.whereToGo')}</Text>
        </View>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => navigation.navigate('Profile')}
        >
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={20} color={colors.primary} />
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Book Taxi CTA */}
      <TouchableOpacity
        style={styles.ctaCard}
        onPress={() => navigation.navigate('Taxi')}
        activeOpacity={0.9}
      >
        <View style={styles.ctaContent}>
          <Text style={styles.ctaTitle}>{t('home.bookTaxi')}</Text>
          <Text style={styles.ctaSubtitle}>{t('home.taxiSubtitle')}</Text>
          <View style={styles.ctaButton}>
            <Text style={styles.ctaButtonText}>{t('home.requestRide')}</Text>
            <Ionicons name="arrow-forward" size={20} color={colors.primaryForeground} />
          </View>
        </View>
        <View style={styles.ctaIconContainer}>
          <Ionicons name="car-sport" size={80} color="rgba(255,255,255,0.2)" />
        </View>
      </TouchableOpacity>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('home.quickActions')}</Text>
        <View style={styles.quickActions}>
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={styles.actionCard}
              onPress={() => navigation.navigate(action.screen)}
            >
              <View style={[styles.actionIcon, { backgroundColor: action.color + '15' }]}>
                <Ionicons name={action.icon} size={24} color={action.color} />
              </View>
              <Text style={styles.actionLabel}>
                {action.id === 'taxi' ? t('home.callTaxi') :
                 action.id === 'rides' ? t('home.myRides') :
                 t('home.profile')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Vehicle Types */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('home.ourFleet')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.vehicleScroll}>
          {VEHICLE_TYPES.map((vehicle) => (
            <TouchableOpacity
              key={vehicle.id}
              style={styles.vehicleCard}
              onPress={() => navigation.navigate('Taxi')}
            >
              <View style={styles.vehicleIconContainer}>
                <Ionicons name={vehicle.icon} size={36} color={colors.primary} />
              </View>
              <Text style={styles.vehicleName}>{t(`taxi.${vehicle.id}`)}</Text>
              <Text style={styles.vehicleDescription} numberOfLines={2}>
                {t(`taxi.${vehicle.id}Desc`)}
              </Text>
              <Text style={styles.vehiclePrice}>${vehicle.priceFrom}+</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: colors.background,
  },
  headerContent: {
    flex: 1,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 4,
  },
  subGreeting: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  profileButton: {
    marginLeft: 16,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaCard: {
    backgroundColor: colors.primary,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: radius['2xl'],
    padding: 24,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  ctaContent: {
    flex: 1,
    zIndex: 1,
  },
  ctaTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primaryForeground,
    marginBottom: 8,
  },
  ctaSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 16,
    lineHeight: 20,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius['2xl'],
  },
  ctaButtonText: {
    color: colors.primaryForeground,
    fontWeight: '600',
    fontSize: 14,
    marginRight: 8,
  },
  ctaIconContainer: {
    position: 'absolute',
    right: -20,
    bottom: -20,
    opacity: 0.5,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 16,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
    ...shadows.sm,
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 12,
    color: colors.foreground,
    fontWeight: '500',
    textAlign: 'center',
  },
  vehicleScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  vehicleCard: {
    backgroundColor: colors.background,
    width: 160,
    borderRadius: radius.xl,
    padding: 16,
    marginRight: 12,
    ...shadows.sm,
  },
  vehicleIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  vehicleName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
  },
  vehicleDescription: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 8,
    lineHeight: 16,
  },
  vehiclePrice: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  bottomPadding: {
    height: 100,
  },
});
