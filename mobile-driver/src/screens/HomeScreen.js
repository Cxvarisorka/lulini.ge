import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MapView from '../components/map/MapViewWrapper';
import Marker from '../components/map/MarkerWrapper';
import { markerImages } from '../components/map/markerImages';
import { useDriver } from '../context/DriverContext';
import { useLocation } from '../context/LocationContext';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { rideAPI } from '../services/api';
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function HomeScreen({ navigation }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const hasFitted = useRef(false);
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);

  const { user } = useAuth();
  const { isOnline, goOnline, goOffline, loading, stats, addActiveRide, activeRides } = useDriver();
  const { location } = useLocation();
  const { newRideRequest, clearRideRequest, isConnected, fetchPendingRides, socket } = useSocket();

  const [showRideRequest, setShowRideRequest] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (newRideRequest) {
      setShowRideRequest(true);
    } else {
      setShowRideRequest(false);
    }
  }, [newRideRequest]);

  // Fit map to ride markers when active ride changes
  const activeRide = activeRides?.[0];
  useEffect(() => {
    if (!activeRide || !mapRef.current) {
      hasFitted.current = false;
      return;
    }
    if (hasFitted.current) return;
    const coords = [];
    if (location) coords.push({ latitude: location.latitude, longitude: location.longitude });
    if (activeRide.pickup?.lat) coords.push({ latitude: activeRide.pickup.lat, longitude: activeRide.pickup.lng });
    if (activeRide.dropoff?.lat) coords.push({ latitude: activeRide.dropoff.lat, longitude: activeRide.dropoff.lng });
    activeRide.stops?.forEach(s => {
      if (s.lat) coords.push({ latitude: s.lat, longitude: s.lng });
    });
    if (coords.length >= 2) {
      hasFitted.current = true;
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    }
  }, [activeRide, location]);

  // [H6 FIX] Prevent double-tap race condition with toggling ref
  const togglingRef = useRef(false);
  const handleToggleOnline = async () => {
    if (togglingRef.current) return;
    togglingRef.current = true;
    try {
      if (isOnline) {
        const result = await goOffline();
        if (!result.success) {
          Alert.alert(t('common.error'), result.message);
        }
      } else {
        const result = await goOnline();
        if (!result.success) {
          Alert.alert(t('common.error'), result.message || t('errors.locationError'));
        } else {
          if (fetchPendingRides) {
            setTimeout(() => {
              fetchPendingRides();
            }, 500);
          }
        }
      }
    } finally {
      togglingRef.current = false;
    }
  };

  const handleAcceptRide = async () => {
    if (!newRideRequest || accepting) return;

    setAccepting(true);
    try {
      const response = await rideAPI.acceptRide(newRideRequest._id);
      if (response.data.success) {
        addActiveRide(response.data.data.ride);
        setShowRideRequest(false);
        clearRideRequest();
        navigation.navigate('RideDetail', { rideId: response.data.data.ride._id });
      }
    } catch (error) {
      const serverMessage = error.response?.data?.message;
      clearRideRequest();
      Alert.alert(
        t('common.error'),
        serverMessage || t('errors.somethingWentWrong')
      );
    } finally {
      setAccepting(false);
    }
  };

  const handleDeclineRide = () => {
    if (!newRideRequest) return;
    setShowRideRequest(false);
    clearRideRequest();
  };

  // Fallback region (Georgia center) used only as initialRegion
  const initialMapRegion = useRef({
    latitude: 42.2679,
    longitude: 43.3569,
    latitudeDelta: 3,
    longitudeDelta: 3,
  }).current;

  // Animate to driver's actual location once GPS resolves
  const hasAnimatedToLocation = useRef(false);
  useEffect(() => {
    if (location && mapRef.current && !hasAnimatedToLocation.current) {
      hasAnimatedToLocation.current = true;
      mapRef.current.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 600);
    }
  }, [location]);

  // [L1 FIX] Memoize stats array to avoid recreation on every render
  const quickStats = useMemo(() => [
    {
      id: 'earnings',
      icon: 'cash',
      value: `${stats.last24Hours?.earnings?.toFixed(2) || '0.00'} ₾`,
      label: t('home.last24Hours'),
      color: colors.success,
    },
    {
      id: 'trips',
      icon: 'car',
      value: stats.last24Hours?.trips || 0,
      label: t('home.requests'),
      color: colors.primary,
    },
    {
      id: 'total',
      icon: 'wallet',
      value: `${stats.total?.earnings?.toFixed(2) || '0.00'} ₾`,
      label: t('home.totalEarnings'),
      color: colors.info,
    },
  ], [stats.last24Hours?.earnings, stats.last24Hours?.trips, stats.total?.earnings, t]);

  return (
    <View style={styles.container}>
      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialMapRegion}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
        >
          {/* Driver location marker */}
          {location && (
            <Marker
              coordinate={{ latitude: location.latitude, longitude: location.longitude }}
              image={markerImages.pickup}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            />
          )}
          {/* Active ride markers */}
          {activeRide?.pickup?.lat && (
            <Marker
              coordinate={{ latitude: activeRide.pickup.lat, longitude: activeRide.pickup.lng }}
              image={markerImages.pickup}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
            />
          )}
          {activeRide?.stops?.map((stop, i) => stop.lat && (
            <Marker
              key={`stop-${i}`}
              coordinate={{ latitude: stop.lat, longitude: stop.lng }}
              image={markerImages.stopSmall[Math.min(i + 1, 9)]}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
            />
          ))}
          {activeRide?.dropoff?.lat && (
            <Marker
              coordinate={{ latitude: activeRide.dropoff.lat, longitude: activeRide.dropoff.lng }}
              image={markerImages.dropoff}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
            />
          )}
        </MapView>

        {/* Top Header */}
        <View style={[styles.headerOverlay, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.welcomeSection}>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => navigation.navigate('Settings')}
              accessibilityLabel={t('settings.title')}
              accessibilityRole="button"
            >
              <Ionicons name="settings-outline" size={24} color={colors.foreground} />
            </TouchableOpacity>
            <View style={styles.welcomeContent}>
              <Text style={styles.greeting} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {t('home.greeting') || 'Hello'}, {user?.firstName || 'Driver'}
              </Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: isOnline ? colors.online : colors.offline }]} />
                <Text style={styles.statusText} numberOfLines={1}>
                  {isOnline ? t('home.youAreOnline') : t('home.youAreOffline')}
                </Text>
              </View>
            </View>
            <View
              style={[styles.connectionBadge, { backgroundColor: isConnected ? '#dcfce7' : '#fee2e2' }]}
              accessibilityLabel={isConnected ? t('connection.connected') : t('connection.reconnecting')}
              accessibilityRole="image"
            >
              <Ionicons
                name={isConnected ? 'wifi' : 'wifi-outline'}
                size={20}
                color={isConnected ? colors.success : colors.destructive}
              />
            </View>
          </View>
          {__DEV__ && (
            <View style={styles.debugBanner}>
              <View style={[styles.debugDot, { backgroundColor: isConnected ? colors.success : colors.destructive }]} />
              <Text style={styles.debugText}>
                Socket: {isConnected ? 'Connected' : 'Disconnected'}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Bottom Panel */}
      <View style={styles.bottomPanel}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.bottomContent, { paddingBottom: insets.bottom + spacing['3xl'] }]}
        >
          {/* Quick Stats */}
          <View style={styles.statsSection}>
            <Text style={styles.sectionTitle} numberOfLines={1}>{t('home.todayStats') || 'TODAY\'S STATS'}</Text>
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

          {/* Toggle Button */}
          <Pressable
            style={({ pressed }) => [
              styles.toggleCard,
              isOnline && styles.toggleCardOnline,
              loading && styles.toggleCardDisabled,
              Platform.OS === 'ios' && pressed && { opacity: 0.9 },
            ]}
            onPress={handleToggleOnline}
            disabled={loading}
            android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: false }}
            accessibilityRole="button"
            accessibilityLabel={isOnline ? t('home.goOffline') : t('home.goOnline')}
            accessibilityState={{ disabled: loading }}
          >
            {loading ? (
              <View style={styles.toggleContent}>
                <ActivityIndicator color={colors.primaryForeground} size="large" />
                <Text style={styles.toggleText}>{t('common.loading')}</Text>
              </View>
            ) : (
              <View style={styles.toggleContent}>
                <View style={styles.toggleIconBadge}>
                  <Ionicons
                    name={isOnline ? 'pause' : 'play'}
                    size={28}
                    color={colors.primaryForeground}
                  />
                </View>
                <View style={styles.toggleTextContainer}>
                  <Text style={styles.toggleTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {isOnline ? t('home.goOffline') : t('home.goOnline')}
                  </Text>
                  <Text style={styles.toggleSubtitle} numberOfLines={1}>
                    {isOnline ? t('home.waitingForRides') : t('home.noActiveRides')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.7)" />
              </View>
            )}
          </Pressable>

          {/* Quick Actions */}
          <View style={styles.actionsSection}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('Rides')}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="car" size={22} color={colors.foreground} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle} numberOfLines={1}>{t('rides.myRides')}</Text>
                <Text style={styles.actionSubtitle} numberOfLines={1}>{t('rides.viewAll') || 'View all rides'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('Earnings')}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="trending-up" size={22} color={colors.foreground} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle} numberOfLines={1}>{t('earnings.title')}</Text>
                <Text style={styles.actionSubtitle} numberOfLines={1}>{t('earnings.viewDetails') || 'View details'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      {/* New Ride Request Modal */}
      <Modal
        visible={showRideRequest}
        transparent
        animationType="slide"
        onRequestClose={handleDeclineRide}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.rideRequestModal, { paddingBottom: insets.bottom + spacing['3xl'] }]}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalIconBadge}>
                <Ionicons name="car" size={28} color={colors.primaryForeground} />
              </View>
              <Text style={styles.modalTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('rides.newRequest')}</Text>
            </View>

            {newRideRequest && (
              <View style={styles.rideDetails}>
                <View style={styles.locationCard}>
                  <View style={styles.rideDetailRow}>
                    <View style={[styles.locationDot, { backgroundColor: colors.success }]} />
                    <View style={styles.rideDetailText}>
                      <Text style={styles.rideDetailLabel} numberOfLines={1}>{t('rides.pickup')}</Text>
                      <Text style={styles.rideDetailValue} numberOfLines={2}>
                        {newRideRequest.pickup?.address || t('common.unknown')}
                      </Text>
                    </View>
                  </View>

                  {newRideRequest.stops?.length > 0 && newRideRequest.stops.map((stop, index) => (
                    <React.Fragment key={`stop-${index}`}>
                      <View style={styles.locationLine} />
                      <View style={styles.rideDetailRow}>
                        <View style={[styles.locationDot, { backgroundColor: colors.stop }]} />
                        <View style={styles.rideDetailText}>
                          <Text style={styles.rideDetailLabel} numberOfLines={1}>{t('rides.stop')} {index + 1}</Text>
                          <Text style={styles.rideDetailValue} numberOfLines={2}>{stop.address}</Text>
                        </View>
                      </View>
                    </React.Fragment>
                  ))}

                  <View style={styles.locationLine} />

                  <View style={styles.rideDetailRow}>
                    <View style={[styles.locationDot, { backgroundColor: colors.destructive }]} />
                    <View style={styles.rideDetailText}>
                      <Text style={styles.rideDetailLabel} numberOfLines={1}>{t('rides.dropoff')}</Text>
                      <Text style={styles.rideDetailValue} numberOfLines={2}>
                        {newRideRequest.dropoff?.address || t('common.unknown')}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.rideInfoGrid}>
                  <View style={styles.rideInfoItem}>
                    <Text style={styles.rideInfoLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('rides.distance')}</Text>
                    <Text style={styles.rideInfoValue} numberOfLines={1}>
                      {newRideRequest.quote?.distanceText || '-'}
                    </Text>
                  </View>
                  <View style={styles.rideInfoItem}>
                    <Text style={styles.rideInfoLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('rides.estimatedFare')}</Text>
                    <Text style={[styles.rideInfoValue, styles.fareHighlight]} numberOfLines={1}>
                      {newRideRequest.quote?.totalPrice?.toFixed(2) || '0.00'} ₾
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.declineButton}
                onPress={handleDeclineRide}
                disabled={accepting}
                accessibilityRole="button"
                accessibilityLabel={t('rides.decline')}
              >
                <Ionicons name="close" size={20} color={colors.destructive} />
                <Text style={styles.declineButtonText} numberOfLines={1}>{t('rides.decline')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.acceptButton, accepting && styles.acceptButtonDisabled]}
                onPress={handleAcceptRide}
                disabled={accepting}
                accessibilityRole="button"
                accessibilityLabel={t('rides.accept')}
                accessibilityState={{ disabled: accepting }}
              >
                {accepting ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color={colors.primaryForeground} />
                    <Text style={styles.acceptButtonText} numberOfLines={1}>{t('rides.accept')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  mapContainer: {
    height: Math.max(SCREEN_HEIGHT * 0.35, 240),
    minHeight: 240,
  },
  map: {
    flex: 1,
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
  },
  welcomeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.md,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeContent: {
    flex: 1,
  },
  greeting: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.mutedForeground,
  },
  connectionBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  debugBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  debugDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  debugText: {
    fontSize: 11,
    color: '#fff',
    fontFamily: 'monospace',
  },
  bottomPanel: {
    flex: 1,
    backgroundColor: colors.muted,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    marginTop: -radius['2xl'],
    ...shadows.lg,
  },
  bottomContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  statsSection: {
    marginBottom: spacing.xl,
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
  toggleCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    overflow: 'hidden',
    ...shadows.md,
  },
  toggleCardOnline: {
    backgroundColor: colors.success,
  },
  toggleCardDisabled: {
    opacity: 0.7,
  },
  toggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  toggleIconBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleTextContainer: {
    flex: 1,
  },
  toggleTitle: {
    ...typography.h2,
    fontWeight: '700',
    color: colors.primaryForeground,
    marginBottom: 2,
  },
  toggleSubtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.8)',
  },
  toggleText: {
    ...typography.bodySmall,
    color: colors.primaryForeground,
    marginTop: spacing.sm,
  },
  actionsSection: {
    gap: spacing.sm,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.foreground,
  },
  actionSubtitle: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  rideRequestModal: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    padding: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  dragHandle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalIconBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h1,
    fontWeight: '700',
    color: colors.foreground,
  },
  rideDetails: {
    marginBottom: spacing.xl,
  },
  locationCard: {
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  rideDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
    marginRight: spacing.md,
  },
  locationLine: {
    width: 2,
    height: 24,
    backgroundColor: colors.border,
    marginLeft: 5,
    marginVertical: spacing.sm,
  },
  rideDetailText: {
    flex: 1,
  },
  rideDetailLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  rideDetailValue: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.foreground,
  },
  rideInfoGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rideInfoItem: {
    flex: 1,
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  rideInfoLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  rideInfoValue: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
  },
  fareHighlight: {
    color: colors.success,
    fontWeight: '700',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.destructive}15`,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  declineButtonText: {
    ...typography.button,
    color: colors.destructive,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  acceptButtonDisabled: {
    opacity: 0.6,
  },
  acceptButtonText: {
    ...typography.button,
    color: colors.primaryForeground,
  },
});
