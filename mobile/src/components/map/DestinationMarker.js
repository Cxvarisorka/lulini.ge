/**
 * DestinationMarker
 *
 * Clean red destination pin with flag icon.
 *
 * Android fix: no elevation — it draws shadows outside the view bounds
 * and Android's react-native-maps clips the bitmap to the root view.
 * Container is 66x66 giving generous padding around the 38px pin.
 */
import React, { memo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

const DestinationMarker = memo(({ coordinate }) => (
  <Marker
    coordinate={coordinate}
    anchor={{ x: 0.5, y: 0.5 }}
    tracksViewChanges={true}
    zIndex={10}
  >
    <View style={styles.container}>
      <View style={styles.pin}>
        <Ionicons name="flag" size={16} color="#fff" />
      </View>
    </View>
  </Marker>
));

DestinationMarker.displayName = 'DestinationMarker';

const styles = StyleSheet.create({
  container: {
    // 66px for 38px pin = 14px padding per side.
    // Prevents Android bitmap clipping of the 3px border and iOS shadow.
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      android: { backgroundColor: 'rgba(255,255,255,0.01)' },
      ios: {},
    }),
  },
  pin: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ef4444',
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: {},
    }),
  },
});

export default DestinationMarker;
