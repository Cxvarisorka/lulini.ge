import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { radius, shadows, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { taxiAPI } from '../services/api';

const MIN_MINUTES_FROM_NOW = 30;
const MAX_DAYS = 7;

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default function ScheduleRideScreen({ navigation, route }) {
  const { pickup, destination, vehicleType } = route.params || {};
  const { t, i18n } = useTranslation();
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(typography, colors), [typography, colors]);

  const minDate = useMemo(() => addMinutes(new Date(), MIN_MINUTES_FROM_NOW), []);
  const maxDate = useMemo(() => addDays(new Date(), MAX_DAYS), []);

  const [selectedDate, setSelectedDate] = useState(addMinutes(new Date(), 60));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);

  const handleDateChange = useCallback((_, date) => {
    setShowDatePicker(false);
    if (!date) return;
    // Preserve existing time, only change the date
    const updated = new Date(selectedDate);
    updated.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    // Clamp within allowed window
    const clamped = Math.min(Math.max(updated.getTime(), minDate.getTime()), maxDate.getTime());
    setSelectedDate(new Date(clamped));
  }, [selectedDate, minDate, maxDate]);

  const handleTimeChange = useCallback((_, time) => {
    setShowTimePicker(false);
    if (!time) return;
    const updated = new Date(selectedDate);
    updated.setHours(time.getHours(), time.getMinutes(), 0, 0);
    const clamped = Math.min(Math.max(updated.getTime(), minDate.getTime()), maxDate.getTime());
    setSelectedDate(new Date(clamped));
  }, [selectedDate, minDate, maxDate]);

  const formatDate = useCallback((date) => {
    return date.toLocaleDateString(i18n.language, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }, [i18n.language]);

  const formatTime = useCallback((date) => {
    return date.toLocaleTimeString(i18n.language, {
      hour: '2-digit', minute: '2-digit',
    });
  }, [i18n.language]);

  const minutesFromNow = Math.round((selectedDate - new Date()) / 60000);

  const handleSchedule = useCallback(async () => {
    if (minutesFromNow < MIN_MINUTES_FROM_NOW) {
      Alert.alert(t('schedule.tooSoon'), t('schedule.tooSoonMessage', { min: MIN_MINUTES_FROM_NOW }));
      return;
    }
    if (!pickup || !destination) {
      Alert.alert(t('common.error'), t('schedule.pickupDropoffRequired'));
      return;
    }

    setIsScheduling(true);
    try {
      const payload = {
        pickup,
        dropoff: destination,
        vehicleType: vehicleType || 'economy',
        paymentMethod: 'cash',
        scheduledFor: selectedDate.toISOString(),
      };
      const res = await taxiAPI.requestRide(payload);
      if (res.data.success) {
        Alert.alert(
          t('schedule.scheduledTitle'),
          t('schedule.scheduledMessage', { time: formatTime(selectedDate), date: formatDate(selectedDate) }),
          [{ text: t('common.ok'), onPress: () => navigation.navigate('ScheduledRides') }]
        );
      }
    } catch (e) {
      Alert.alert(t('common.error'), t('errors.somethingWentWrong'));
    } finally {
      setIsScheduling(false);
    }
  }, [minutesFromNow, pickup, destination, vehicleType, selectedDate, t, navigation, formatTime, formatDate]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Route Summary */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('schedule.routeSummary')}</Text>
        <View style={styles.routeItem}>
          <View style={[styles.routeDot, { backgroundColor: colors.success }]} />
          <View style={styles.routeText}>
            <Text style={styles.routeLabel}>{t('taxi.pickupPoint')}</Text>
            <Text style={styles.routeAddress} numberOfLines={2}>
              {pickup?.address || t('schedule.notSet')}
            </Text>
          </View>
        </View>
        <View style={styles.routeConnector} />
        <View style={styles.routeItem}>
          <View style={[styles.routeDot, { backgroundColor: colors.destructive }]} />
          <View style={styles.routeText}>
            <Text style={styles.routeLabel}>{t('taxi.dropoffPoint')}</Text>
            <Text style={styles.routeAddress} numberOfLines={2}>
              {destination?.address || t('schedule.notSet')}
            </Text>
          </View>
        </View>
      </View>

      {/* Date & Time Picker */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('schedule.selectDateTime')}</Text>

        {/* Date */}
        <TouchableOpacity
          style={styles.pickerRow}
          onPress={() => setShowDatePicker(true)}
          accessibilityRole="button"
          accessibilityLabel={t('schedule.selectDate')}
          accessibilityHint={t('schedule.selectDateHint')}
        >
          <View style={styles.pickerIcon}>
            <Ionicons name="calendar-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.pickerInfo}>
            <Text style={styles.pickerLabel}>{t('schedule.date')}</Text>
            <Text style={styles.pickerValue}>{formatDate(selectedDate)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

        <View style={styles.rowDivider} />

        {/* Time */}
        <TouchableOpacity
          style={styles.pickerRow}
          onPress={() => setShowTimePicker(true)}
          accessibilityRole="button"
          accessibilityLabel={t('schedule.selectTime')}
          accessibilityHint={t('schedule.selectTimeHint')}
        >
          <View style={styles.pickerIcon}>
            <Ionicons name="time-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.pickerInfo}>
            <Text style={styles.pickerLabel}>{t('schedule.time')}</Text>
            <Text style={styles.pickerValue}>{formatTime(selectedDate)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle-outline" size={18} color={colors.info} />
        <Text style={styles.infoText}>
          {t('schedule.infoMin', { min: MIN_MINUTES_FROM_NOW })}
          {' · '}
          {t('schedule.infoMax', { days: MAX_DAYS })}
        </Text>
      </View>

      {/* ETA from now */}
      <View style={styles.etaCard}>
        <Ionicons name="hourglass-outline" size={20} color={colors.primary} />
        <Text style={styles.etaText}>
          {minutesFromNow < 60
            ? t('schedule.inMinutes', { min: minutesFromNow })
            : t('schedule.inHours', { hours: Math.floor(minutesFromNow / 60), min: minutesFromNow % 60 })}
        </Text>
      </View>

      {/* Native Date Pickers */}
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          minimumDate={minDate}
          maximumDate={maxDate}
          onChange={handleDateChange}
          locale={i18n.language}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleTimeChange}
          locale={i18n.language}
        />
      )}

      {/* Confirm Button */}
      <TouchableOpacity
        style={[styles.confirmButton, isScheduling && styles.confirmButtonDisabled]}
        onPress={handleSchedule}
        disabled={isScheduling}
        accessibilityRole="button"
        accessibilityLabel={t('schedule.confirm')}
        accessibilityState={{ disabled: isScheduling }}
      >
        {isScheduling ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : (
          <>
            <Ionicons name="calendar-check" size={20} color={colors.background} />
            <Text style={styles.confirmButtonText}>{t('schedule.confirm')}</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (typography, colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  cardTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 14,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 3,
  },
  routeText: {
    flex: 1,
  },
  routeLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginBottom: 1,
  },
  routeAddress: {
    ...typography.bodyMedium,
    color: colors.foreground,
  },
  routeConnector: {
    width: 2,
    height: 18,
    backgroundColor: colors.border,
    marginLeft: 5,
    marginVertical: 4,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 12,
  },
  pickerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerInfo: {
    flex: 1,
  },
  pickerLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginBottom: 2,
  },
  pickerValue: {
    ...typography.bodyMedium,
    color: colors.foreground,
    fontWeight: '500',
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.info + '12',
    borderRadius: radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.info + '30',
  },
  infoText: {
    ...typography.bodySmall,
    color: colors.info,
    flex: 1,
  },
  etaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primary + '10',
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  etaText: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontWeight: '500',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radius.lg,
    marginTop: 4,
    ...shadows.md,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    ...typography.button,
    color: colors.background,
    fontWeight: '600',
  },
});
