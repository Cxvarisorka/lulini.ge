import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '../../theme/colors';

export default function RouteSummary({ pickup, destination, duration }) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.locationRow}>
        <View style={styles.dotContainer}>
          <View style={[styles.dot, styles.greenDot]} />
          <View style={styles.dotLine} />
          <View style={[styles.dot, styles.redDot]} />
        </View>
        <View style={styles.locationsContainer}>
          <View style={styles.locationItem}>
            <Text style={styles.locationLabel}>{t('taxi.pickup')}</Text>
            <Text style={styles.locationText} numberOfLines={1}>
              {pickup?.address || t('taxi.currentLocation')}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.locationItem}>
            <Text style={styles.locationLabel}>{t('taxi.dropoff')}</Text>
            <Text style={styles.locationText} numberOfLines={1}>
              {destination?.address || destination}
            </Text>
          </View>
        </View>
      </View>
      {duration && (
        <View style={styles.durationBadge}>
          <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
          <Text style={styles.durationText}>{duration} {t('taxi.minutes')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
  },
  dotContainer: {
    width: 20,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  greenDot: {
    backgroundColor: colors.success,
  },
  redDot: {
    backgroundColor: colors.destructive,
  },
  dotLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  locationsContainer: {
    flex: 1,
    marginLeft: 12,
  },
  locationItem: {
    paddingVertical: 4,
  },
  locationLabel: {
    fontSize: 11,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  locationText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  durationText: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginLeft: 6,
  },
});
