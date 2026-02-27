import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  InteractionManager,
  Modal,
  ScrollView,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';

import { colors, shadows, radius, useTypography } from '../theme/colors';
import { taxiAPI } from '../services/api';

const CACHE_KEY = '@rides_cache';
const PAGE_SIZE = 20;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const STATUS_COLORS = {
  pending: colors.status.pending,
  accepted: colors.info,
  arrived: colors.info,
  driver_arrived: colors.info,
  in_progress: colors.status.active,
  inProgress: colors.status.active,
  completed: colors.status.completed,
  cancelled: colors.status.cancelled,
};

const STATUS_FILTERS = ['all', 'completed', 'cancelled', 'in_progress', 'pending'];
const VEHICLE_FILTERS = ['all', 'economy', 'comfort', 'business'];

const STATUS_KEY_MAP = {
  in_progress: 'inProgress',
  driver_arrived: 'arrived',
};

function statusTranslationKey(status) {
  return STATUS_KEY_MAP[status] || status;
}

function getRideFare(ride) {
  return ride.fare || ride.quote?.totalPrice || 0;
}

function formatShortDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

export default function TaxiHistoryScreen({ navigation }) {
  const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
  const { t } = useTranslation();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter state (applied)
  const [statusFilter, setStatusFilter] = useState('all');
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);

  // Filter modal state (draft — applied on confirm)
  const [filterVisible, setFilterVisible] = useState(false);
  const [draftStatus, setDraftStatus] = useState('all');
  const [draftVehicle, setDraftVehicle] = useState('all');
  const [draftPriceMin, setDraftPriceMin] = useState('');
  const [draftPriceMax, setDraftPriceMax] = useState('');
  const [draftDateFrom, setDraftDateFrom] = useState(null);
  const [draftDateTo, setDraftDateTo] = useState(null);

  // Date picker visibility
  const [showDateFromPicker, setShowDateFromPicker] = useState(false);
  const [showDateToPicker, setShowDateToPicker] = useState(false);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const currentPage = useRef(1);
  const hasMore = useRef(true);

  const filteredRides = useMemo(() => {
    const minP = priceMin !== '' ? parseFloat(priceMin) : null;
    const maxP = priceMax !== '' ? parseFloat(priceMax) : null;
    return rides.filter(ride => {
      if (statusFilter !== 'all' && ride.status !== statusFilter) return false;
      if (vehicleFilter !== 'all' && ride.vehicleType !== vehicleFilter) return false;
      const fare = getRideFare(ride);
      if (minP !== null && fare < minP) return false;
      if (maxP !== null && fare > maxP) return false;
      if (dateFrom) {
        const rideDate = new Date(ride.createdAt);
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        if (rideDate < from) return false;
      }
      if (dateTo) {
        const rideDate = new Date(ride.createdAt);
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (rideDate > to) return false;
      }
      return true;
    });
  }, [rides, statusFilter, vehicleFilter, priceMin, priceMax, dateFrom, dateTo]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== 'all') count++;
    if (vehicleFilter !== 'all') count++;
    if (priceMin !== '' || priceMax !== '') count++;
    if (dateFrom || dateTo) count++;
    return count;
  }, [statusFilter, vehicleFilter, priceMin, priceMax, dateFrom, dateTo]);

  const hasActiveFilters = activeFilterCount > 0;

  // --- Filter modal ---
  const openFilterModal = useCallback(() => {
    setDraftStatus(statusFilter);
    setDraftVehicle(vehicleFilter);
    setDraftPriceMin(priceMin);
    setDraftPriceMax(priceMax);
    setDraftDateFrom(dateFrom);
    setDraftDateTo(dateTo);
    setShowDateFromPicker(false);
    setShowDateToPicker(false);
    setFilterVisible(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
    }).start();
  }, [statusFilter, vehicleFilter, priceMin, priceMax, dateFrom, dateTo, slideAnim]);

  const closeFilterModal = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setFilterVisible(false));
  }, [slideAnim]);

  const applyFilters = useCallback(() => {
    setStatusFilter(draftStatus);
    setVehicleFilter(draftVehicle);
    setPriceMin(draftPriceMin);
    setPriceMax(draftPriceMax);
    setDateFrom(draftDateFrom);
    setDateTo(draftDateTo);
    closeFilterModal();
  }, [draftStatus, draftVehicle, draftPriceMin, draftPriceMax, draftDateFrom, draftDateTo, closeFilterModal]);

  const clearAllDrafts = useCallback(() => {
    setDraftStatus('all');
    setDraftVehicle('all');
    setDraftPriceMin('');
    setDraftPriceMax('');
    setDraftDateFrom(null);
    setDraftDateTo(null);
    setShowDateFromPicker(false);
    setShowDateToPicker(false);
  }, []);

  const clearAppliedFilters = useCallback(() => {
    setStatusFilter('all');
    setVehicleFilter('all');
    setPriceMin('');
    setPriceMax('');
    setDateFrom(null);
    setDateTo(null);
  }, []);

  // --- Data loading ---
  useEffect(() => {
    let mounted = true;
    const task = InteractionManager.runAfterInteractions(async () => {
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw && mounted) {
          const cached = JSON.parse(raw);
          if (cached.rides?.length) setRides(cached.rides);
        }
      } catch {}
      if (mounted) setLoading(false);
      try {
        const response = await taxiAPI.getMyRides({ page: 1, limit: PAGE_SIZE });
        if (response.data.success && mounted) {
          const serverRides = response.data.data.rides || [];
          setRides(serverRides);
          currentPage.current = 1;
          hasMore.current = response.data.page < response.data.pages;
          AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
            rides: serverRides, total: response.data.total, timestamp: Date.now(),
          })).catch(() => {});
        }
      } catch {}
    });
    return () => { mounted = false; task.cancel(); };
  }, []);

  const fetchNextPage = useCallback(async () => {
    if (loadingMore || !hasMore.current) return;
    setLoadingMore(true);
    const nextPage = currentPage.current + 1;
    try {
      const response = await taxiAPI.getMyRides({ page: nextPage, limit: PAGE_SIZE });
      if (response.data.success) {
        const newRides = response.data.data.rides || [];
        currentPage.current = nextPage;
        hasMore.current = response.data.page < response.data.pages;
        setRides(prev => {
          const existingIds = new Set(prev.map(r => r._id));
          const unique = newRides.filter(r => !existingIds.has(r._id));
          const merged = [...prev, ...unique];
          AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
            rides: merged.slice(0, 60), total: response.data.total, timestamp: Date.now(),
          })).catch(() => {});
          return merged;
        });
      }
    } catch {}
    setLoadingMore(false);
  }, [loadingMore]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await taxiAPI.getMyRides({ page: 1, limit: PAGE_SIZE });
      if (response.data.success) {
        const serverRides = response.data.data.rides || [];
        setRides(serverRides);
        currentPage.current = 1;
        hasMore.current = response.data.page < response.data.pages;
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
          rides: serverRides, total: response.data.total, timestamp: Date.now(),
        })).catch(() => {});
      }
    } catch {}
    setRefreshing(false);
  }, []);

  // --- Helpers ---
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getStatusColor = (status) => STATUS_COLORS[status] || colors.mutedForeground;

  const getStatusLabel = (status) => {
    if (status === 'all') return t('history.allStatuses');
    return t(`taxi.status.${statusTranslationKey(status)}`);
  };

  const getVehicleLabel = (type) => {
    if (type === 'all') return t('history.allVehicles');
    return t(`taxi.${type}`);
  };

  // --- Date picker handlers ---
  const onDateFromChange = useCallback((event, selectedDate) => {
    if (Platform.OS === 'android') setShowDateFromPicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) setDraftDateFrom(selectedDate);
  }, []);

  const onDateToChange = useCallback((event, selectedDate) => {
    if (Platform.OS === 'android') setShowDateToPicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) setDraftDateTo(selectedDate);
  }, []);

  // --- Filter bar (compact, above list) ---
  const renderFilterBar = () => (
    <View style={styles.filterBar}>
      <TouchableOpacity
        style={[styles.filterButton, hasActiveFilters && styles.filterButtonActive]}
        onPress={openFilterModal}
        activeOpacity={0.7}
      >
        <Ionicons name="options-outline" size={18} color={hasActiveFilters ? colors.primaryForeground : colors.foreground} />
        <Text style={[styles.filterButtonText, hasActiveFilters && styles.filterButtonTextActive]}>
          {t('history.filters')}
        </Text>
        {activeFilterCount > 0 && (
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {hasActiveFilters && (
        <TouchableOpacity onPress={clearAppliedFilters} style={styles.clearBtn} activeOpacity={0.7}>
          <Ionicons name="close-circle" size={16} color={colors.destructive} />
          <Text style={styles.clearBtnText}>{t('history.clearFilters')}</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.resultCount}>
        {filteredRides.length} {t('history.ridesFound')}
      </Text>
    </View>
  );

  // --- Ride item ---
  const renderRideItem = ({ item }) => (
    <TouchableOpacity
      style={styles.rideCard}
      onPress={() => navigation.navigate('RideDetail', { ride: item })}
      activeOpacity={0.7}
    >
      <View style={styles.rideHeader}>
        <View style={styles.dateContainer}>
          <Ionicons name="calendar-outline" size={16} color={colors.mutedForeground} />
          <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {t(`taxi.status.${statusTranslationKey(item.status)}`)}
          </Text>
        </View>
      </View>

      <View style={styles.routeContainer}>
        <View style={styles.routePoint}>
          <View style={styles.routeDot}>
            <Ionicons name="radio-button-on" size={12} color={colors.success} />
          </View>
          <View style={styles.routeInfo}>
            <Text style={styles.routeLabel}>{t('taxi.pickupPoint')}</Text>
            <Text style={styles.routeAddress} numberOfLines={1}>
              {item.pickup?.address || 'N/A'}
            </Text>
          </View>
        </View>

        <View style={styles.routeLine} />

        {item.stops?.length > 0 && item.stops.map((stop, i) => (
          <React.Fragment key={`stop-${i}`}>
            <View style={styles.routePoint}>
              <View style={styles.routeDot}>
                <View style={styles.stopDot}>
                  <Text style={styles.stopDotText}>{i + 1}</Text>
                </View>
              </View>
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>{t('taxi.stop')} {i + 1}</Text>
                <Text style={styles.routeAddress} numberOfLines={1}>
                  {stop.address || 'N/A'}
                </Text>
              </View>
            </View>
            <View style={styles.routeLine} />
          </React.Fragment>
        ))}

        <View style={styles.routePoint}>
          <View style={styles.routeDot}>
            <Ionicons name="location" size={12} color={colors.destructive} />
          </View>
          <View style={styles.routeInfo}>
            <Text style={styles.routeLabel}>{t('taxi.dropoffPoint')}</Text>
            <Text style={styles.routeAddress} numberOfLines={1}>
              {item.dropoff?.address || 'N/A'}
            </Text>
          </View>
        </View>
      </View>

      {item.driver && (
        <View style={styles.driverRow}>
          <View style={styles.driverAvatarSmall}>
            <Ionicons name="person" size={16} color={colors.primary} />
          </View>
          <Text style={styles.driverName} numberOfLines={1}>
            {[item.driver.user?.firstName, item.driver.user?.lastName].filter(Boolean).join(' ')
              || item.driver.user?.fullName
              || t('taxi.driver')}
          </Text>
          {item.driver.rating > 0 && (
            <View style={styles.driverRatingRow}>
              <Ionicons name="star" size={12} color="#FFA500" />
              <Text style={styles.driverRating}>{item.driver.rating.toFixed(1)}</Text>
            </View>
          )}
          {item.driver.vehicle?.licensePlate && (
            <View style={styles.plateBadge}>
              <Text style={styles.plateText}>{item.driver.vehicle.licensePlate}</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.rideFooter}>
        <View style={styles.footerItem}>
          <Ionicons name="car-outline" size={16} color={colors.mutedForeground} />
          <Text style={styles.footerText}>{t(`taxi.${item.vehicleType || 'economy'}`)}</Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons name="cash-outline" size={16} color={colors.mutedForeground} />
          <Text style={styles.footerText}>
            {getRideFare(item) ? getRideFare(item).toFixed(2) : '0.00'} ₾
          </Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
          <Text style={styles.footerText}>
            {item.quote?.durationText || `${item.quote?.duration || 0} min`}
          </Text>
        </View>
      </View>

      <View style={styles.viewDetailRow}>
        <Text style={styles.viewDetailText}>{t('history.viewDetails')}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );

  const renderEmptyList = () => {
    if (hasActiveFilters) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="filter-outline" size={64} color={colors.mutedForeground} />
          </View>
          <Text style={styles.emptyTitle}>{t('history.noFilterResults')}</Text>
          <Text style={styles.emptyDescription}>{t('history.noFilterResultsDesc')}</Text>
          <TouchableOpacity style={styles.bookButton} onPress={clearAppliedFilters}>
            <Ionicons name="close-circle-outline" size={20} color={colors.background} />
            <Text style={styles.bookButtonText}>{t('history.clearFilters')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="car-outline" size={64} color={colors.mutedForeground} />
        </View>
        <Text style={styles.emptyTitle}>{t('taxi.noRides')}</Text>
        <Text style={styles.emptyDescription}>{t('taxi.noRidesDesc')}</Text>
        <TouchableOpacity style={styles.bookButton} onPress={() => navigation.navigate('Taxi')}>
          <Ionicons name="add" size={20} color={colors.background} />
          <Text style={styles.bookButtonText}>{t('home.callTaxi')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  if (loading && rides.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredRides}
        renderItem={renderRideItem}
        keyExtractor={(item) => item._id || item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderFilterBar}
        ListEmptyComponent={renderEmptyList}
        ListFooterComponent={renderFooter}
        onEndReached={fetchNextPage}
        onEndReachedThreshold={0.3}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      />

      {/* Filter Modal */}
      <Modal visible={filterVisible} transparent animationType="none" onRequestClose={closeFilterModal}>
        <TouchableWithoutFeedback onPress={closeFilterModal}>
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>
        <Animated.View style={[styles.modalSheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.modalHandle} />

          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('history.filters')}</Text>
            <TouchableOpacity onPress={clearAllDrafts}>
              <Text style={styles.modalReset}>{t('history.resetAll')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBody} keyboardShouldPersistTaps="handled">
            {/* Status */}
            <Text style={styles.modalSectionTitle}>{t('history.status')}</Text>
            <View style={styles.chipGrid}>
              {STATUS_FILTERS.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, draftStatus === s && styles.chipActive]}
                  onPress={() => setDraftStatus(s)}
                >
                  <Text style={[styles.chipText, draftStatus === s && styles.chipTextActive]}>
                    {getStatusLabel(s)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Vehicle type */}
            <Text style={styles.modalSectionTitle}>{t('history.vehicleType')}</Text>
            <View style={styles.chipGrid}>
              {VEHICLE_FILTERS.map(v => (
                <TouchableOpacity
                  key={v}
                  style={[styles.chip, draftVehicle === v && styles.chipActive]}
                  onPress={() => setDraftVehicle(v)}
                >
                  <Text style={[styles.chipText, draftVehicle === v && styles.chipTextActive]}>
                    {getVehicleLabel(v)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Price range */}
            <Text style={styles.modalSectionTitle}>{t('history.priceRange')}</Text>
            <View style={styles.inputRow}>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.filterInput}
                  value={draftPriceMin}
                  onChangeText={setDraftPriceMin}
                  placeholder={t('history.minPrice')}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                />
                <Text style={styles.inputSuffix}>₾</Text>
              </View>
              <Text style={styles.inputDash}>—</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.filterInput}
                  value={draftPriceMax}
                  onChangeText={setDraftPriceMax}
                  placeholder={t('history.maxPrice')}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                />
                <Text style={styles.inputSuffix}>₾</Text>
              </View>
            </View>

            {/* Date range */}
            <Text style={styles.modalSectionTitle}>{t('history.dateRange')}</Text>
            <View style={styles.inputRow}>
              <TouchableOpacity
                style={styles.dateInput}
                onPress={() => { setShowDateFromPicker(true); setShowDateToPicker(false); }}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={16} color={colors.mutedForeground} />
                <Text style={[styles.dateInputText, !draftDateFrom && styles.dateInputPlaceholder]}>
                  {draftDateFrom ? formatShortDate(draftDateFrom) : t('history.from')}
                </Text>
                {draftDateFrom && (
                  <TouchableOpacity onPress={() => { setDraftDateFrom(null); setShowDateFromPicker(false); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
              <Text style={styles.inputDash}>—</Text>
              <TouchableOpacity
                style={styles.dateInput}
                onPress={() => { setShowDateToPicker(true); setShowDateFromPicker(false); }}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={16} color={colors.mutedForeground} />
                <Text style={[styles.dateInputText, !draftDateTo && styles.dateInputPlaceholder]}>
                  {draftDateTo ? formatShortDate(draftDateTo) : t('history.to')}
                </Text>
                {draftDateTo && (
                  <TouchableOpacity onPress={() => { setDraftDateTo(null); setShowDateToPicker(false); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </View>

            {showDateFromPicker && (
              <DateTimePicker
                value={draftDateFrom || new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onDateFromChange}
                maximumDate={draftDateTo || new Date()}
              />
            )}
            {showDateToPicker && (
              <DateTimePicker
                value={draftDateTo || new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onDateToChange}
                minimumDate={draftDateFrom || undefined}
                maximumDate={new Date()}
              />
            )}

            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.applyButton} onPress={applyFilters} activeOpacity={0.8}>
              <Text style={styles.applyButtonText}>{t('history.applyFilters')}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Modal>
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
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
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  // Filter bar
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    ...typography.caption,
    color: colors.foreground,
    fontWeight: '500',
    marginLeft: 6,
  },
  filterButtonTextActive: {
    color: colors.primaryForeground,
    fontWeight: '600',
  },
  filterBadge: {
    backgroundColor: colors.primaryForeground,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  filterBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearBtnText: {
    ...typography.captionSmall,
    color: colors.destructive,
    fontWeight: '500',
    marginLeft: 3,
  },
  resultCount: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginLeft: 'auto',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.8,
    paddingBottom: 34,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  modalTitle: {
    ...typography.display,
    color: colors.foreground,
  },
  modalReset: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  modalBody: {
    paddingHorizontal: 20,
  },
  modalSectionTitle: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 10,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.caption,
    color: colors.mutedForeground,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.primaryForeground,
    fontWeight: '600',
  },
  // Price & date inputs
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 44,
  },
  filterInput: {
    flex: 1,
    ...typography.body,
    color: colors.foreground,
    paddingVertical: 0,
  },
  inputSuffix: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginLeft: 4,
  },
  inputDash: {
    ...typography.body,
    color: colors.mutedForeground,
  },
  dateInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  dateInputText: {
    flex: 1,
    ...typography.body,
    color: colors.foreground,
  },
  dateInputPlaceholder: {
    color: colors.mutedForeground,
  },
  // Modal footer
  modalFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  applyButton: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  applyButtonText: {
    ...typography.h2,
    color: colors.primaryForeground,
  },
  // Ride card
  rideCard: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    marginLeft: 6,
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
  },
  routeContainer: {
    marginBottom: 16,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeDot: {
    width: 24,
    alignItems: 'center',
    paddingTop: 2,
  },
  stopDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopDotText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: colors.border,
    marginLeft: 11,
  },
  routeInfo: {
    flex: 1,
    marginLeft: 8,
  },
  routeLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginBottom: 2,
  },
  routeAddress: {
    ...typography.bodyMedium,
    color: colors.foreground,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  driverAvatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  driverName: {
    ...typography.bodyMedium,
    fontWeight: '500',
    color: colors.foreground,
    flex: 1,
  },
  driverRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  driverRating: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.foreground,
    marginLeft: 3,
  },
  plateBadge: {
    backgroundColor: colors.muted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginLeft: 8,
  },
  plateText: {
    ...typography.captionSmall,
    fontWeight: '600',
    color: colors.foreground,
    letterSpacing: 0.5,
  },
  rideFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerText: {
    marginLeft: 4,
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  viewDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  viewDetailText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '500',
    marginRight: 2,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    ...typography.display,
    color: colors.foreground,
    marginBottom: 8,
  },
  emptyDescription: {
    ...typography.body,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginBottom: 24,
  },
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: radius.lg,
  },
  bookButtonText: {
    color: colors.background,
    ...typography.h2,
    marginLeft: 8,
  },
});
