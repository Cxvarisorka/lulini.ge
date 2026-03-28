import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, shadows, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { taxiAPI } from '../services/api';

export default function ScheduledRidesScreen({ navigation }) {
  const { t, i18n } = useTranslation();
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);

  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(null);

  const loadRides = useCallback(async () => {
    setLoading(true);
    try {
      const res = await taxiAPI.getScheduledRides();
      if (res.data.success) {
        setRides(res.data.data || []);
      }
    } catch (e) {
      if (__DEV__) console.warn('[ScheduledRides] load error:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRides();
  }, [loadRides]);

  const handleCancel = useCallback((ride) => {
    Alert.alert(
      t('schedule.cancelTitle'),
      t('schedule.cancelMessage'),
      [
        { text: t('common.no'), style: 'cancel' },
        {
          text: t('taxi.cancelRide'),
          style: 'destructive',
          onPress: async () => {
            setCancelling(ride._id);
            try {
              await taxiAPI.cancelRide(ride._id, 'changed_my_mind');
              setRides(prev => prev.filter(r => r._id !== ride._id));
            } catch (e) {
              Alert.alert(t('common.error'), t('errors.somethingWentWrong'));
            } finally {
              setCancelling(null);
            }
          },
        },
      ]
    );
  }, [t]);

  const formatDateTime = useCallback((dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString(i18n.language, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }, [i18n.language]);

  const getTimeUntil = useCallback((dateString) => {
    if (!dateString) return '';
    const diff = Math.round((new Date(dateString) - new Date()) / 60000);
    if (diff < 0) return t('schedule.past');
    if (diff < 60) return t('schedule.inMinutes', { min: diff });
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    if (hours < 24) return t('schedule.inHoursMin', { hours, min: mins });
    const days = Math.floor(hours / 24);
    return t('schedule.inDays', { days });
  }, [t]);

  const renderRide = useCallback(({ item }) => {
    const isCancelling = cancelling === item._id;

    return (
      <View style={styles.rideCard}>
        {/* Header */}
        <View style={styles.rideCardHeader}>
          <View style={styles.scheduledBadge}>
            <Ionicons name="calendar" size={14} color={colors.primary} />
            <Text style={styles.scheduledBadgeText}>{t('schedule.scheduled')}</Text>
          </View>
          <Text style={styles.timeUntil}>{getTimeUntil(item.scheduledFor)}</Text>
        </View>

        {/* Date */}
        <Text style={styles.scheduledTime}>{formatDateTime(item.scheduledFor)}</Text>

        {/* Route */}
        <View style={styles.routeSection}>
          <View style={styles.routeRow}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <Text style={styles.routeText} numberOfLines={1}>
              {item.pickup?.address || '—'}
            </Text>
          </View>
          <View style={styles.routeConnector} />
          <View style={styles.routeRow}>
            <View style={[styles.dot, { backgroundColor: colors.destructive }]} />
            <Text style={styles.routeText} numberOfLines={1}>
              {item.dropoff?.address || '—'}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.rideCardFooter}>
          <View style={styles.vehicleChip}>
            <Ionicons name="car-outline" size={14} color={colors.mutedForeground} />
            <Text style={styles.vehicleText}>{t(`taxi.${item.vehicleType || 'economy'}`)}</Text>
          </View>

          <TouchableOpacity
            style={[styles.cancelButton, isCancelling && styles.cancelButtonDisabled]}
            onPress={() => handleCancel(item)}
            disabled={isCancelling}
            accessibilityRole="button"
            accessibilityLabel={t('taxi.cancelRide')}
            accessibilityState={{ disabled: isCancelling }}
          >
            {isCancelling ? (
              <ActivityIndicator size="small" color={colors.destructive} />
            ) : (
              <>
                <Ionicons name="close-circle-outline" size={16} color={colors.destructive} />
                <Text style={styles.cancelButtonText}>{t('taxi.cancelRide')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [t, cancelling, formatDateTime, getTimeUntil, handleCancel]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={rides}
      keyExtractor={item => item._id}
      renderItem={renderRide}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={56} color={colors.border} />
          <Text style={styles.emptyTitle}>{t('schedule.noScheduled')}</Text>
          <Text style={styles.emptyDesc}>{t('schedule.noScheduledDesc')}</Text>
          <TouchableOpacity
            style={styles.bookButton}
            onPress={() => navigation.navigate('Taxi')}
            accessibilityRole="button"
            accessibilityLabel={t('home.bookTaxi')}
          >
            <Text style={styles.bookButtonText}>{t('home.bookTaxi')}</Text>
          </TouchableOpacity>
        </View>
      }
    />
  );
}

const createStyles = (typography, colors) => StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
    flexGrow: 1,
  },
  rideCard: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  rideCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  scheduledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary + '12',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  scheduledBadgeText: {
    ...typography.captionSmall,
    fontWeight: '600',
    color: colors.primary,
  },
  timeUntil: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
  },
  scheduledTime: {
    ...typography.h3,
    color: colors.foreground,
    marginBottom: 12,
    fontWeight: '600',
  },
  routeSection: {
    marginBottom: 12,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeText: {
    ...typography.bodySmall,
    color: colors.foreground,
    flex: 1,
  },
  routeConnector: {
    width: 2,
    height: 16,
    backgroundColor: colors.border,
    marginLeft: 4,
    marginVertical: 3,
  },
  rideCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  vehicleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  vehicleText: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.destructive + '40',
  },
  cancelButtonDisabled: {
    opacity: 0.5,
  },
  cancelButtonText: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.destructive,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    ...typography.h2,
    color: colors.foreground,
    marginTop: 8,
  },
  emptyDesc: {
    ...typography.body,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  bookButton: {
    marginTop: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.lg,
  },
  bookButtonText: {
    ...typography.button,
    color: colors.background,
    fontWeight: '600',
  },
});
