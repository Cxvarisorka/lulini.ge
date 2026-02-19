import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSocket } from '../context/SocketContext';
import { useNetwork } from '../context/NetworkContext';

// Three-state connectivity indicator:
//   offline       = no internet (red)
//   reconnecting  = internet OK but socket down (orange)
//   connected     = fully operational (green, auto-hides)

const ConnectionStatusBar = () => {
  const { connected: socketConnected } = useSocket();
  const { isInternetReachable } = useNetwork();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-60)).current;
  const [visible, setVisible] = useState(false);
  const prevStateRef = useRef('connected'); // 'connected' | 'reconnecting' | 'offline'

  // Derive current state
  const isOffline = !isInternetReachable;
  const isReconnecting = isInternetReachable && !socketConnected;
  const isFullyConnected = isInternetReachable && socketConnected;

  const currentState = isOffline
    ? 'offline'
    : isReconnecting
      ? 'reconnecting'
      : 'connected';

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = currentState;

    if (currentState !== 'connected' && prev === 'connected') {
      // Went from healthy to degraded — show bar
      setVisible(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else if (currentState !== 'connected' && prev !== 'connected') {
      // State changed between offline ↔ reconnecting — keep visible, already shown
      setVisible(true);
    } else if (currentState === 'connected' && visible) {
      // Recovered — show green "Connected" briefly, then hide
      const timer = setTimeout(() => {
        Animated.timing(slideAnim, {
          toValue: -60,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setVisible(false));
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [currentState]);

  if (!visible) return null;

  const barStyle = isOffline
    ? styles.barOffline
    : isFullyConnected
      ? styles.barConnected
      : styles.barReconnecting;

  const icon = isOffline
    ? 'wifi-outline'
    : isFullyConnected
      ? 'checkmark-circle'
      : 'cloud-offline';

  const label = isOffline
    ? t('connection.noInternet')
    : isFullyConnected
      ? t('connection.connected')
      : t('connection.reconnecting');

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 4,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={[styles.bar, barStyle]}>
        <Ionicons name={icon} size={16} color="#fff" />
        <Text style={styles.text}>{label}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  barOffline: {
    backgroundColor: '#dc2626',
  },
  barReconnecting: {
    backgroundColor: '#ea580c',
  },
  barConnected: {
    backgroundColor: '#16a34a',
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default ConnectionStatusBar;
