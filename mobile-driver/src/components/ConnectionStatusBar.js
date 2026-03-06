import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSocket } from '../context/SocketContext';
import { colors, useTypography } from '../theme/colors';

const ConnectionStatusBar = () => {
  const { isConnected } = useSocket();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const slideAnim = useRef(new Animated.Value(-60)).current;
  const [visible, setVisible] = useState(false);
  const wasConnectedRef = useRef(true);

  useEffect(() => {
    if (!isConnected && wasConnectedRef.current) {
      // Lost connection — show bar
      setVisible(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else if (isConnected && visible) {
      // Reconnected — hide after brief delay so user sees "Connected"
      const timer = setTimeout(() => {
        Animated.timing(slideAnim, {
          toValue: -60,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setVisible(false));
      }, 2000);
      return () => clearTimeout(timer);
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  if (!visible) return null;

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
      <View style={[styles.bar, isConnected ? styles.barConnected : styles.barDisconnected]}>
        <Ionicons
          name={isConnected ? 'checkmark-circle' : 'cloud-offline'}
          size={16}
          color={colors.primaryForeground}
        />
        <Text style={[styles.text, { ...typography.caption }]}>
          {isConnected ? t('connection.connected') : t('connection.reconnecting')}
        </Text>
      </View>
    </Animated.View>
  );
};

// [M2 FIX] Use theme colors instead of hardcoded values
// [M3 FIX] Typography applied inline via useTypography() hook
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
  barDisconnected: {
    backgroundColor: colors.destructive,
  },
  barConnected: {
    backgroundColor: colors.success,
  },
  text: {
    color: colors.primaryForeground,
    fontWeight: '600',
  },
});

export default ConnectionStatusBar;
