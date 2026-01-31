import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform, Linking, Alert } from 'react-native';

const MapContext = createContext();

export const useMap = () => {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMap must be used within MapProvider');
  }
  return context;
};

const MAP_PROVIDERS = [
  {
    code: 'google',
    name: 'Google Maps',
    icon: 'map',
    getNavigationUrl: (lat, lng, address) => {
      if (Platform.OS === 'ios') {
        return `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
      }
      return `google.navigation:q=${lat},${lng}`;
    },
    getFallbackUrl: (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  },
  {
    code: 'waze',
    name: 'Waze',
    icon: 'navigate',
    getNavigationUrl: (lat, lng) => `waze://?ll=${lat},${lng}&navigate=yes`,
    getFallbackUrl: (lat, lng) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  },
  {
    code: 'yandex',
    name: 'Yandex Maps',
    icon: 'location',
    getNavigationUrl: (lat, lng) => {
      if (Platform.OS === 'ios') {
        return `yandexmaps://maps.yandex.ru/?rtext=~${lat},${lng}&rtt=auto`;
      }
      return `yandexmaps://maps.yandex.ru/?rtext=~${lat},${lng}&rtt=auto`;
    },
    getFallbackUrl: (lat, lng) => `https://yandex.com/maps/?rtext=~${lat},${lng}&rtt=auto`,
  },
  {
    code: 'apple',
    name: 'Apple Maps',
    icon: 'compass',
    available: Platform.OS === 'ios',
    getNavigationUrl: (lat, lng) => `maps://app?daddr=${lat},${lng}`,
    getFallbackUrl: (lat, lng) => `https://maps.apple.com/?daddr=${lat},${lng}`,
  },
  {
    code: 'osm',
    name: 'OpenStreetMap',
    icon: 'globe',
    getNavigationUrl: (lat, lng) => `https://www.openstreetmap.org/directions?to=${lat},${lng}`,
    getFallbackUrl: (lat, lng) => `https://www.openstreetmap.org/directions?to=${lat},${lng}`,
  },
];

export const MapProvider = ({ children }) => {
  const [currentMap, setCurrentMap] = useState('google');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMapPreference();
  }, []);

  const loadMapPreference = async () => {
    try {
      const savedMap = await SecureStore.getItemAsync('mapProvider');
      if (savedMap) {
        setCurrentMap(savedMap);
      }
    } catch (error) {
      console.log('Error loading map preference:', error);
    } finally {
      setLoading(false);
    }
  };

  const changeMap = async (mapCode) => {
    try {
      await SecureStore.setItemAsync('mapProvider', mapCode);
      setCurrentMap(mapCode);
    } catch (error) {
      console.log('Error saving map preference:', error);
    }
  };

  const getCurrentMapName = () => {
    const map = MAP_PROVIDERS.find((m) => m.code === currentMap);
    return map ? map.name : 'Google Maps';
  };

  const getAvailableMaps = () => {
    return MAP_PROVIDERS.filter((map) => map.available !== false);
  };

  const navigateTo = async (lat, lng, address, t) => {
    const map = MAP_PROVIDERS.find((m) => m.code === currentMap);
    if (!map) return;

    const url = map.getNavigationUrl(lat, lng, address);
    const fallbackUrl = map.getFallbackUrl(lat, lng);

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        // Try fallback URL (web version)
        await Linking.openURL(fallbackUrl);
      }
    } catch (error) {
      console.log('Error opening navigation:', error);
      // Show alert with option to open in browser
      Alert.alert(
        t ? t('common.error') : 'Error',
        t ? t('settings.mapNotInstalled') : 'Map app not installed. Opening in browser.',
        [
          { text: t ? t('common.cancel') : 'Cancel', style: 'cancel' },
          {
            text: t ? t('common.continue') : 'Continue',
            onPress: () => Linking.openURL(fallbackUrl),
          },
        ]
      );
    }
  };

  const value = {
    currentMap,
    changeMap,
    maps: getAvailableMaps(),
    getCurrentMapName,
    navigateTo,
    loading,
  };

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
};
