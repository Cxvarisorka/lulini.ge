import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';
import {
  getNavigationRoute,
  formatDistance,
  formatDuration,
  haversineDistance,
  getManeuverIcon,
  getManeuverInstruction,
} from '../services/directions';

const STEP_ARRIVAL_THRESHOLD = 30; // meters
const ROUTE_DEVIATION_THRESHOLD = 100; // meters
const RECALC_COOLDOWN = 15000; // ms
const GPS_UPDATE_INTERVAL = 3000; // ms
const GPS_UPDATE_DISTANCE = 5; // meters

export default function NavigationScreen({ navigation, route: navRoute }) {
  const { destination, origin } = navRoute.params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography, insets), [typography, insets]);

  const [routeData, setRouteData] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [driverLocation, setDriverLocation] = useState(origin);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isFollowing, setIsFollowing] = useState(true);
  const [hasArrived, setHasArrived] = useState(false);

  const webViewRef = useRef(null);
  const locationWatcherRef = useRef(null);
  const lastRecalcTimeRef = useRef(0);
  const driverLocationRef = useRef(origin);
  const routeDataRef = useRef(null);
  const currentStepIndexRef = useRef(0);

  // Keep refs in sync to avoid stale closures in GPS callback
  useEffect(() => { driverLocationRef.current = driverLocation; }, [driverLocation]);
  useEffect(() => { routeDataRef.current = routeData; }, [routeData]);
  useEffect(() => { currentStepIndexRef.current = currentStepIndex; }, [currentStepIndex]);

  useEffect(() => {
    fetchRoute();
    startHighFreqGPS();
    return () => stopHighFreqGPS();
  }, []);

  const fetchRoute = async () => {
    const driverPos = driverLocationRef.current;
    if (!driverPos) {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const pos = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setDriverLocation(pos);
        driverLocationRef.current = pos;
        await fetchRouteFrom(pos);
      } catch {
        Alert.alert(t('common.error'), t('errors.locationError'));
        navigation.goBack();
      }
    } else {
      await fetchRouteFrom(driverPos);
    }
  };

  const fetchRouteFrom = async (fromPos) => {
    setIsLoading(true);
    const result = await getNavigationRoute(fromPos, destination);
    if (!result) {
      Alert.alert(t('common.error'), t('nav.routeError'));
      navigation.goBack();
      return;
    }
    setRouteData(result);
    setCurrentStepIndex(0);
    setIsLoading(false);
    updateMapRoute(result, fromPos);
  };

  const startHighFreqGPS = async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return;

    locationWatcherRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: GPS_UPDATE_INTERVAL,
        distanceInterval: GPS_UPDATE_DISTANCE,
      },
      (loc) => {
        const pos = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setDriverLocation(pos);
        driverLocationRef.current = pos;
        onLocationUpdate(pos);
      }
    );
  };

  const stopHighFreqGPS = () => {
    if (locationWatcherRef.current) {
      locationWatcherRef.current.remove();
      locationWatcherRef.current = null;
    }
  };

  const onLocationUpdate = useCallback((pos) => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        updateDriverLocation(${pos.latitude}, ${pos.longitude});
        true;
      `);
    }

    const route = routeDataRef.current;
    if (!route) return;

    // Check arrival at destination
    const distToDest = haversineDistance(
      pos.latitude, pos.longitude,
      destination.latitude, destination.longitude
    );
    if (distToDest < STEP_ARRIVAL_THRESHOLD) {
      setHasArrived(true);
      return;
    }

    // Step advancement
    const stepIdx = currentStepIndexRef.current;
    if (stepIdx < route.steps.length - 1) {
      const nextStep = route.steps[stepIdx + 1];
      const distToNextManeuver = haversineDistance(
        pos.latitude, pos.longitude,
        nextStep.maneuver.location[0], nextStep.maneuver.location[1]
      );
      if (distToNextManeuver < STEP_ARRIVAL_THRESHOLD) {
        setCurrentStepIndex(stepIdx + 1);
      }
    }

    // Route deviation check
    const minDistToRoute = getMinDistanceToPolyline(pos, route.polyline);
    if (minDistToRoute > ROUTE_DEVIATION_THRESHOLD) {
      recalculateRoute(pos);
    }
  }, []);

  const getMinDistanceToPolyline = (pos, polyline) => {
    let minDist = Infinity;
    for (let i = 0; i < polyline.length; i += 5) {
      const d = haversineDistance(pos.latitude, pos.longitude, polyline[i][0], polyline[i][1]);
      if (d < minDist) minDist = d;
    }
    return minDist;
  };

  const recalculateRoute = async (pos) => {
    const now = Date.now();
    if (now - lastRecalcTimeRef.current < RECALC_COOLDOWN) return;
    lastRecalcTimeRef.current = now;

    setIsRecalculating(true);
    const result = await getNavigationRoute(pos, destination);
    if (result) {
      setRouteData(result);
      setCurrentStepIndex(0);
      updateMapRoute(result, pos);
    }
    setIsRecalculating(false);
  };

  const updateMapRoute = (route, driverPos) => {
    if (!webViewRef.current) return;
    const polylineJson = JSON.stringify(route.polyline);
    webViewRef.current.injectJavaScript(`
      drawRoute(${polylineJson});
      updateDriverLocation(${driverPos.latitude}, ${driverPos.longitude});
      true;
    `);
  };

  const handleRecenter = () => {
    setIsFollowing(true);
    const pos = driverLocationRef.current;
    if (pos && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        recenterMap(${pos.latitude}, ${pos.longitude});
        true;
      `);
    }
  };

  const handleExit = () => {
    navigation.goBack();
  };

  // Current step data
  const currentStep = routeData?.steps?.[currentStepIndex];
  const nextStep = routeData?.steps?.[currentStepIndex + 1];

  const distanceToNextStep = currentStep && driverLocation
    ? (() => {
        const target = nextStep
          ? nextStep.maneuver.location
          : [destination.latitude, destination.longitude];
        return haversineDistance(
          driverLocation.latitude, driverLocation.longitude,
          target[0], target[1]
        );
      })()
    : null;

  const remainingDistance = routeData && currentStepIndex < routeData.steps.length
    ? routeData.steps.slice(currentStepIndex).reduce((sum, s) => sum + s.distance, 0)
    : 0;

  const remainingDuration = routeData && currentStepIndex < routeData.steps.length
    ? routeData.steps.slice(currentStepIndex).reduce((sum, s) => sum + s.duration, 0)
    : 0;

  const getMapHTML = () => {
    const lat = driverLocation?.latitude || destination.latitude;
    const lng = driverLocation?.longitude || destination.longitude;
    const destLat = destination.latitude;
    const destLng = destination.longitude;
    const routePolyline = routeData ? JSON.stringify(routeData.polyline) : '[]';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          * { margin: 0; padding: 0; }
          body { overflow: hidden; }
          #map { width: 100vw; height: 100vh; }
          .driver-marker {
            background: #5b21b6;
            border: 3px solid white;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          }
          .driver-pulse {
            background: rgba(91, 33, 182, 0.15);
            border-radius: 50%;
            width: 48px;
            height: 48px;
            animation: pulse 2s ease-out infinite;
          }
          @keyframes pulse {
            0% { transform: scale(0.5); opacity: 1; }
            100% { transform: scale(1.5); opacity: 0; }
          }
          .dest-marker-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .dest-marker {
            background: #ef4444;
            border: 3px solid white;
            border-radius: 50% 50% 50% 0;
            width: 24px;
            height: 24px;
            transform: rotate(-45deg);
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', {
            zoomControl: false,
            attributionControl: false,
          }).setView([${lat}, ${lng}], 16);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
          }).addTo(map);

          // Driver marker with pulse
          var driverIcon = L.divIcon({
            className: '',
            html: '<div class="driver-pulse"></div><div class="driver-marker" style="position:absolute;top:12px;left:12px;"></div>',
            iconSize: [48, 48],
            iconAnchor: [24, 24],
          });
          var driverMarker = L.marker([${lat}, ${lng}], { icon: driverIcon, zIndexOffset: 1000 }).addTo(map);

          // Destination marker
          var destIcon = L.divIcon({
            className: '',
            html: '<div class="dest-marker-wrapper"><div class="dest-marker"></div></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 24],
          });
          var destMarker = L.marker([${destLat}, ${destLng}], { icon: destIcon }).addTo(map);

          var routeLayer = null;
          var isFollowing = true;

          function drawRoute(polyline) {
            if (routeLayer) {
              map.removeLayer(routeLayer);
            }
            if (polyline && polyline.length > 0) {
              routeLayer = L.polyline(polyline, {
                color: '#5b21b6',
                weight: 5,
                opacity: 0.8,
                lineCap: 'round',
                lineJoin: 'round',
              }).addTo(map);

              var bounds = routeLayer.getBounds().extend(destMarker.getLatLng());
              map.fitBounds(bounds, { padding: [60, 60] });
            }
          }

          function updateDriverLocation(lat, lng) {
            driverMarker.setLatLng([lat, lng]);
            if (isFollowing) {
              map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
            }
          }

          function recenterMap(lat, lng) {
            isFollowing = true;
            map.setView([lat, lng], 16, { animate: true });
          }

          map.on('dragstart', function() {
            isFollowing = false;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapDragged' }));
          });

          // Draw initial route
          var initialRoute = ${routePolyline};
          if (initialRoute.length > 0) {
            drawRoute(initialRoute);
          }
        </script>
      </body>
      </html>
    `;
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{t('nav.calculatingRoute')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Instruction Bar */}
      <View style={styles.instructionBar}>
        {hasArrived ? (
          <View style={styles.arrivedContainer}>
            <Ionicons name="flag" size={32} color={colors.success} />
            <Text style={styles.arrivedText}>{t('nav.arrived')}</Text>
          </View>
        ) : currentStep ? (
          <View style={styles.instructionContent}>
            <View style={styles.maneuverIconContainer}>
              <Ionicons
                name={getManeuverIcon(currentStep.maneuver.type, currentStep.maneuver.modifier)}
                size={32}
                color={colors.primaryForeground}
              />
            </View>
            <View style={styles.instructionTextContainer}>
              <Text style={styles.instructionText} numberOfLines={2}>
                {getManeuverInstruction(currentStep, t)}
              </Text>
              {distanceToNextStep !== null && (
                <Text style={styles.instructionDistance}>
                  {formatDistance(distanceToNextStep)}
                </Text>
              )}
            </View>
          </View>
        ) : null}
        {isRecalculating && (
          <View style={styles.recalcBadge}>
            <ActivityIndicator size="small" color={colors.primaryForeground} />
            <Text style={styles.recalcText}>{t('nav.recalculating')}</Text>
          </View>
        )}
      </View>

      {/* Map */}
      <WebView
        ref={webViewRef}
        source={{ html: getMapHTML() }}
        style={styles.map}
        scrollEnabled={false}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'mapDragged') {
              setIsFollowing(false);
            }
          } catch {}
        }}
      />

      {/* Bottom Controls */}
      <View style={styles.bottomBar}>
        <View style={styles.etaContainer}>
          <Text style={styles.etaValue}>{formatDuration(remainingDuration)}</Text>
          <Text style={styles.etaLabel}>{formatDistance(remainingDistance)}</Text>
        </View>

        <View style={styles.bottomButtons}>
          {!isFollowing && (
            <TouchableOpacity style={styles.recenterButton} onPress={handleRecenter}>
              <Ionicons name="locate" size={24} color={colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
            <Ionicons name="close" size={24} color={colors.destructive} />
            <Text style={styles.exitText}>{t('nav.exit')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const createStyles = (typography, insets) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    ...typography.body,
    color: colors.mutedForeground,
    marginTop: spacing.md,
  },
  map: {
    flex: 1,
  },

  // Instruction Bar
  instructionBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: colors.primary,
    paddingTop: insets.top + spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    ...shadows.lg,
  },
  instructionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  maneuverIconContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  instructionTextContainer: {
    flex: 1,
  },
  instructionText: {
    ...typography.h2,
    fontWeight: '700',
    color: colors.primaryForeground,
  },
  instructionDistance: {
    ...typography.body,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginTop: spacing.xs,
  },
  arrivedContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  arrivedText: {
    ...typography.h1,
    fontWeight: '700',
    color: colors.primaryForeground,
    marginTop: spacing.sm,
  },
  recalcBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  recalcText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.7)',
  },

  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: colors.background,
    paddingTop: spacing.md,
    paddingBottom: insets.bottom + spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.lg,
  },
  etaContainer: {
    flex: 1,
  },
  etaValue: {
    ...typography.h1,
    fontWeight: '700',
    color: colors.foreground,
  },
  etaLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
  },
  bottomButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  recenterButton: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.destructive}15`,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  exitText: {
    ...typography.button,
    fontWeight: '600',
    color: colors.destructive,
  },
});
