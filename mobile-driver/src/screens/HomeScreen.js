import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDriver } from '../context/DriverContext';
import { useLocation } from '../context/LocationContext';
import { useSocket } from '../context/SocketContext';
import { rideAPI } from '../services/api';
import { colors, shadows, radius } from '../theme/colors';

const { width, height } = Dimensions.get('window');

export default function HomeScreen({ navigation }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef(null);

  const { isOnline, goOnline, goOffline, loading, stats, addActiveRide } = useDriver();
  const { location, isTracking } = useLocation();
  const { newRideRequest, clearRideRequest, isConnected, fetchPendingRides } = useSocket();

  const [showRideRequest, setShowRideRequest] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (newRideRequest) {
      setShowRideRequest(true);
    } else {
      // Hide modal when ride request is cleared (cancelled by user or accepted by another driver)
      setShowRideRequest(false);
    }
  }, [newRideRequest]);

  useEffect(() => {
    // Update map when location changes
    if (location && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        updateDriverLocation(${location.latitude}, ${location.longitude});
        true;
      `);
    }
  }, [location]);

  const handleToggleOnline = async () => {
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
        // Fetch any pending ride requests when going online
        // Add slight delay to ensure status is updated on backend
        if (fetchPendingRides) {
          setTimeout(() => {
            fetchPendingRides();
          }, 500);
        }
      }
    }
  };

  const handleAcceptRide = async () => {
    if (!newRideRequest) return;

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
      console.log('Error accepting ride:', error);
      Alert.alert(t('common.error'), t('errors.somethingWentWrong'));
    } finally {
      setAccepting(false);
    }
  };

  const handleDeclineRide = () => {
    if (!newRideRequest) return;

    // Simply clear the ride request locally
    // The ride remains available for other drivers
    setShowRideRequest(false);
    clearRideRequest();
  };

  const getMapHTML = () => {
    const lat = location?.latitude || 41.7151;
    const lng = location?.longitude || 44.8271;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body { margin: 0; padding: 0; }
          #map { width: 100%; height: 100vh; }
          .driver-marker {
            background: #171717;
            border: 3px solid white;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', {
            zoomControl: false,
            attributionControl: false
          }).setView([${lat}, ${lng}], 15);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
          }).addTo(map);

          var driverIcon = L.divIcon({
            className: 'driver-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });

          var driverMarker = L.marker([${lat}, ${lng}], {icon: driverIcon}).addTo(map);

          function updateDriverLocation(lat, lng) {
            driverMarker.setLatLng([lat, lng]);
            map.setView([lat, lng], map.getZoom());
          }
        </script>
      </body>
      </html>
    `;
  };

  return (
    <View style={styles.container}>
      {/* Map */}
      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          source={{ html: getMapHTML() }}
          style={styles.map}
          scrollEnabled={false}
        />

        {/* Status Bar */}
        <View style={[styles.statusBar, { top: insets.top + 10 }]}>
          <View style={styles.statusLeft}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isOnline ? colors.online : colors.offline },
              ]}
            />
            <Text style={styles.statusText}>
              {isOnline ? t('home.youAreOnline') : t('home.youAreOffline')}
            </Text>
          </View>
          <View style={styles.connectionStatus}>
            <Ionicons
              name={isConnected ? 'wifi' : 'wifi-outline'}
              size={16}
              color={isConnected ? colors.success : colors.mutedForeground}
            />
          </View>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Ionicons name="cash-outline" size={20} color={colors.primary} />
            <Text style={styles.statValue}>
              ${stats.last24Hours?.earnings?.toFixed(2) || '0.00'}
            </Text>
            <Text style={styles.statLabel}>{t('home.last24Hours')}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="car-outline" size={20} color={colors.primary} />
            <Text style={styles.statValue}>{stats.last24Hours?.trips || 0}</Text>
            <Text style={styles.statLabel}>{t('home.requests')}</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="wallet-outline" size={20} color={colors.primary} />
            <Text style={styles.statValue}>
              ${stats.total?.earnings?.toFixed(2) || '0.00'}
            </Text>
            <Text style={styles.statLabel}>{t('home.totalEarnings')}</Text>
          </View>
        </View>
      </View>

      {/* Bottom Section */}
      <View style={styles.bottomContainer}>
        {/* Main Toggle Button */}
        <TouchableOpacity
          style={[
            styles.toggleButton,
            isOnline && styles.toggleButtonOnline,
            loading && styles.toggleButtonDisabled,
          ]}
          onPress={handleToggleOnline}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <Ionicons
                name={isOnline ? 'pause' : 'play'}
                size={32}
                color={colors.background}
              />
              <Text style={styles.toggleButtonText}>
                {isOnline ? t('home.goOffline') : t('home.goOnline')}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Status Message */}
        <Text style={styles.statusMessage}>
          {isOnline ? t('home.waitingForRides') : t('home.noActiveRides')}
        </Text>
      </View>

      {/* New Ride Request Modal */}
      <Modal
        visible={showRideRequest}
        transparent
        animationType="slide"
        onRequestClose={handleDeclineRide}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.rideRequestModal}>
            <Text style={styles.modalTitle}>{t('rides.newRequest')}</Text>

            {newRideRequest && (
              <View style={styles.rideDetails}>
                <View style={styles.rideDetailRow}>
                  <Ionicons name="radio-button-on" size={20} color={colors.success} />
                  <View style={styles.rideDetailText}>
                    <Text style={styles.rideDetailLabel}>{t('rides.pickup')}</Text>
                    <Text style={styles.rideDetailValue} numberOfLines={2}>
                      {newRideRequest.pickup?.address || 'Unknown'}
                    </Text>
                  </View>
                </View>

                <View style={styles.rideDetailRow}>
                  <Ionicons name="location" size={20} color={colors.destructive} />
                  <View style={styles.rideDetailText}>
                    <Text style={styles.rideDetailLabel}>{t('rides.dropoff')}</Text>
                    <Text style={styles.rideDetailValue} numberOfLines={2}>
                      {newRideRequest.dropoff?.address || 'Unknown'}
                    </Text>
                  </View>
                </View>

                <View style={styles.rideInfoRow}>
                  <View style={styles.rideInfoItem}>
                    <Text style={styles.rideInfoLabel}>{t('rides.distance')}</Text>
                    <Text style={styles.rideInfoValue}>
                      {newRideRequest.quote?.distanceText || '-'}
                    </Text>
                  </View>
                  <View style={styles.rideInfoItem}>
                    <Text style={styles.rideInfoLabel}>{t('rides.estimatedFare')}</Text>
                    <Text style={styles.rideInfoValue}>
                      ${newRideRequest.quote?.totalPrice?.toFixed(2) || '0.00'}
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
              >
                <Text style={styles.declineButtonText}>{t('rides.decline')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.acceptButton, accepting && styles.acceptButtonDisabled]}
                onPress={handleAcceptRide}
                disabled={accepting}
              >
                {accepting ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.acceptButtonText}>{t('rides.accept')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  statusBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: 12,
    ...shadows.md,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
  connectionStatus: {
    padding: 4,
  },
  statsContainer: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: 12,
    marginHorizontal: 4,
    alignItems: 'center',
    ...shadows.md,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  bottomContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    padding: 24,
    paddingBottom: 32,
    alignItems: 'center',
    ...shadows.lg,
  },
  toggleButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
  },
  toggleButtonOnline: {
    backgroundColor: colors.success,
  },
  toggleButtonDisabled: {
    opacity: 0.6,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.background,
    marginTop: 8,
  },
  statusMessage: {
    fontSize: 16,
    color: colors.mutedForeground,
    marginTop: 16,
    textAlign: 'center',
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
    padding: 24,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 20,
    textAlign: 'center',
  },
  rideDetails: {
    marginBottom: 20,
  },
  rideDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  rideDetailText: {
    flex: 1,
    marginLeft: 12,
  },
  rideDetailLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  rideDetailValue: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.foreground,
  },
  rideInfoRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  rideInfoItem: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    padding: 12,
    marginHorizontal: 4,
  },
  rideInfoLabel: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  rideInfoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  declineButton: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: 'center',
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: colors.success,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: 'center',
  },
  acceptButtonDisabled: {
    opacity: 0.6,
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },
});
