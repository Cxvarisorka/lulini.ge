import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDriver } from '../context/DriverContext';
import { useSocket } from '../context/SocketContext';
import { rideAPI } from '../services/api';
import { colors, shadows, radius } from '../theme/colors';

export default function RidesScreen({ navigation }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { activeRides, addActiveRide, loadAllRides } = useDriver();
  const { newRideRequest, clearRideRequest } = useSocket();
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('active');
  const [allRides, setAllRides] = useState([]);
  const [loading, setLoading] = useState(false);

  // Advanced filters
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [dateRange, setDateRange] = useState('anytime');
  const [sortBy, setSortBy] = useState('newest');

  // Track if any filters are active
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (minPrice) count++;
    if (maxPrice) count++;
    if (dateRange !== 'anytime') count++;
    if (sortBy !== 'newest') count++;
    return count;
  }, [minPrice, maxPrice, dateRange, sortBy]);

  const loadRides = useCallback(async (forceRefresh = false) => {
    setLoading(true);

    try {
      // Use cached data from context - it handles caching automatically
      const { rides, fromCache } = await loadAllRides(forceRefresh);

      if (fromCache) {
        console.log('Using cached rides data');
      } else {
        console.log('Fetched fresh rides data');
      }

      // Filter based on selected tab
      if (selectedFilter === 'active') {
        // Active rides are already managed by loadAllRides
      } else {
        let filteredRides = rides;
        if (selectedFilter === 'completed') {
          filteredRides = rides.filter(ride => ride.status === 'completed');
        } else if (selectedFilter === 'cancelled') {
          filteredRides = rides.filter(ride => ride.status === 'cancelled');
        }
        // For 'all' filter, use all rides
        setAllRides(filteredRides);
      }
    } catch (error) {
      console.log('Error loading rides:', error);
      Alert.alert(t('common.error'), t('errors.tryAgain'));
    } finally {
      setLoading(false);
    }
  }, [selectedFilter, loadAllRides, t]);

  useEffect(() => {
    loadRides();
  }, [loadRides]);

  const onRefresh = async () => {
    setRefreshing(true);
    // Force refresh on pull-to-refresh to get fresh data from server
    await loadRides(true);
    setRefreshing(false);
  };

  const handleAcceptRide = async () => {
    if (!newRideRequest) return;

    setAccepting(true);
    try {
      const response = await rideAPI.acceptRide(newRideRequest._id);
      if (response.data.success) {
        addActiveRide(response.data.data.ride);
        clearRideRequest();
        Alert.alert(
          t('rides.rideAccepted'),
          t('rides.navigateToRide'),
          [
            {
              text: t('common.ok'),
              onPress: () => navigation.navigate('RideDetail', { rideId: newRideRequest._id })
            }
          ]
        );
      }
    } catch (error) {
      console.log('Error accepting ride:', error);
      const errorMessage = error.response?.data?.message || t('errors.tryAgain');
      Alert.alert(t('errors.error'), errorMessage);
    } finally {
      setAccepting(false);
    }
  };

  const handleDeclineRide = () => {
    clearRideRequest();
  };

  const renderRideItem = ({ item }) => (
    <TouchableOpacity
      style={styles.rideCard}
      onPress={() => navigation.navigate('RideDetail', { rideId: item._id })}
    >
      <View style={styles.rideHeader}>
        <View style={[styles.statusBadge, { backgroundColor: colors.status[item.status] + '20' }]}>
          <Text style={[styles.statusText, { color: colors.status[item.status] }]}>
            {t(`rides.${item.status}`)}
          </Text>
        </View>
        <Text style={styles.fareText}>${item.quote?.totalPrice?.toFixed(2)}</Text>
      </View>

      <View style={styles.locationRow}>
        <Ionicons name="radio-button-on" size={16} color={colors.success} />
        <Text style={styles.locationText} numberOfLines={1}>
          {item.pickup?.address}
        </Text>
      </View>

      <View style={styles.locationRow}>
        <Ionicons name="location" size={16} color={colors.destructive} />
        <Text style={styles.locationText} numberOfLines={1}>
          {item.dropoff?.address}
        </Text>
      </View>

      <View style={styles.rideFooter}>
        <Text style={styles.distanceText}>{item.quote?.distanceText}</Text>
        <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );

  const applyAdvancedFilters = useCallback((rides) => {
    let filtered = [...rides];

    // Filter by price range
    if (minPrice) {
      const min = parseFloat(minPrice);
      filtered = filtered.filter(ride => (ride.quote?.totalPrice || 0) >= min);
    }
    if (maxPrice) {
      const max = parseFloat(maxPrice);
      filtered = filtered.filter(ride => (ride.quote?.totalPrice || 0) <= max);
    }

    // Filter by date range
    if (dateRange !== 'anytime') {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      filtered = filtered.filter(ride => {
        const rideDate = new Date(ride.createdAt);
        switch (dateRange) {
          case 'today':
            return rideDate >= startOfDay;
          case 'thisWeek':
            const weekAgo = new Date(startOfDay);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return rideDate >= weekAgo;
          case 'thisMonth':
            const monthAgo = new Date(startOfDay);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return rideDate >= monthAgo;
          default:
            return true;
        }
      });
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.createdAt) - new Date(b.createdAt);
        case 'highestPrice':
          return (b.quote?.totalPrice || 0) - (a.quote?.totalPrice || 0);
        case 'lowestPrice':
          return (a.quote?.totalPrice || 0) - (b.quote?.totalPrice || 0);
        case 'newest':
        default:
          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });

    return filtered;
  }, [minPrice, maxPrice, dateRange, sortBy]);

  const getRidesToDisplay = () => {
    const baseRides = selectedFilter === 'active' ? activeRides : allRides;
    return applyAdvancedFilters(baseRides);
  };

  const clearFilters = () => {
    setMinPrice('');
    setMaxPrice('');
    setDateRange('anytime');
    setSortBy('newest');
  };

  const filters = [
    { key: 'active', label: t('rides.activeTab') },
    { key: 'all', label: t('rides.allTab') },
    { key: 'completed', label: t('rides.completedTab') },
    { key: 'cancelled', label: t('rides.cancelledTab') },
  ];

  const ridesToDisplay = getRidesToDisplay();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('rides.myRides')}</Text>
        <TouchableOpacity
          style={styles.filterIconButton}
          onPress={() => setShowFiltersModal(true)}
        >
          <Ionicons name="options-outline" size={24} color={colors.foreground} />
          {activeFiltersCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.filterWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
        >
          {filters.map((filter) => (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.filterButton,
                selectedFilter === filter.key && styles.filterButtonActive,
              ]}
              onPress={() => setSelectedFilter(filter.key)}
            >
              <Text
                style={[
                  styles.filterText,
                  selectedFilter === filter.key && styles.filterTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {ridesToDisplay.length === 0 && !loading ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="car-outline" size={64} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>
            {selectedFilter === 'active' ? t('home.noActiveRides') : t('rides.noRidesFound')}
          </Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          <FlatList
            data={ridesToDisplay}
            renderItem={renderRideItem}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            ListEmptyComponent={null}
          />
          {loading && (
            <View style={styles.loadingOverlay}>
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>{t('common.loading')}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* New Ride Request Modal */}
      <Modal
        visible={!!newRideRequest}
        animationType="slide"
        transparent={true}
        onRequestClose={handleDeclineRide}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="car" size={40} color={colors.primary} />
              <Text style={styles.modalTitle}>{t('rides.newRequest')}</Text>
            </View>

            {newRideRequest && (
              <>
                <View style={styles.rideInfo}>
                  <View style={styles.locationRow}>
                    <Ionicons name="radio-button-on" size={20} color={colors.success} />
                    <View style={styles.locationTextContainer}>
                      <Text style={styles.locationLabel}>{t('rides.pickup')}</Text>
                      <Text style={styles.locationAddress}>{newRideRequest.pickup?.address}</Text>
                    </View>
                  </View>

                  <View style={styles.locationDivider} />

                  <View style={styles.locationRow}>
                    <Ionicons name="location" size={20} color={colors.destructive} />
                    <View style={styles.locationTextContainer}>
                      <Text style={styles.locationLabel}>{t('rides.dropoff')}</Text>
                      <Text style={styles.locationAddress}>{newRideRequest.dropoff?.address}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.rideDetails}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>{t('rides.distance')}</Text>
                    <Text style={styles.detailValue}>{newRideRequest.quote?.distanceText}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>{t('rides.duration')}</Text>
                    <Text style={styles.detailValue}>{newRideRequest.quote?.durationText}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>{t('rides.fare')}</Text>
                    <Text style={styles.fareValue}>${newRideRequest.quote?.totalPrice}</Text>
                  </View>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.declineButton]}
                    onPress={handleDeclineRide}
                    disabled={accepting}
                  >
                    <Ionicons name="close-circle" size={20} color={colors.destructive} />
                    <Text style={styles.declineText}>{t('common.decline')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.acceptButton]}
                    onPress={handleAcceptRide}
                    disabled={accepting}
                  >
                    {accepting ? (
                      <ActivityIndicator color={colors.background} />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={20} color={colors.background} />
                        <Text style={styles.acceptText}>{t('common.accept')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Filters Modal */}
      <Modal
        visible={showFiltersModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFiltersModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.filtersModalContent}>
            <View style={styles.filtersModalHeader}>
              <Text style={styles.filtersModalTitle}>{t('rides.filters')}</Text>
              <TouchableOpacity onPress={() => setShowFiltersModal(false)}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filtersScrollView} showsVerticalScrollIndicator={false}>
              {/* Price Range */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>{t('rides.priceRange')}</Text>
                <View style={styles.priceInputRow}>
                  <View style={styles.priceInputContainer}>
                    <Text style={styles.priceInputLabel}>{t('rides.minPrice')}</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={minPrice}
                      onChangeText={setMinPrice}
                      placeholder="$0"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.priceSeparator}>
                    <Text style={styles.priceSeparatorText}>-</Text>
                  </View>
                  <View style={styles.priceInputContainer}>
                    <Text style={styles.priceInputLabel}>{t('rides.maxPrice')}</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={maxPrice}
                      onChangeText={setMaxPrice}
                      placeholder="$999"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>

              {/* Date Range */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>{t('rides.dateRange')}</Text>
                <View style={styles.optionsGrid}>
                  {[
                    { key: 'anytime', label: t('rides.anytime') },
                    { key: 'today', label: t('rides.today') },
                    { key: 'thisWeek', label: t('rides.thisWeek') },
                    { key: 'thisMonth', label: t('rides.thisMonth') },
                  ].map((option) => (
                    <TouchableOpacity
                      key={option.key}
                      style={[
                        styles.optionChip,
                        dateRange === option.key && styles.optionChipActive,
                      ]}
                      onPress={() => setDateRange(option.key)}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          dateRange === option.key && styles.optionChipTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Sort By */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>{t('rides.sortBy')}</Text>
                <View style={styles.optionsGrid}>
                  {[
                    { key: 'newest', label: t('rides.newest') },
                    { key: 'oldest', label: t('rides.oldest') },
                    { key: 'highestPrice', label: t('rides.highestPrice') },
                    { key: 'lowestPrice', label: t('rides.lowestPrice') },
                  ].map((option) => (
                    <TouchableOpacity
                      key={option.key}
                      style={[
                        styles.optionChip,
                        sortBy === option.key && styles.optionChipActive,
                      ]}
                      onPress={() => setSortBy(option.key)}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          sortBy === option.key && styles.optionChipTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            {/* Filter Actions */}
            <View style={styles.filterActions}>
              <TouchableOpacity
                style={styles.clearFiltersButton}
                onPress={clearFilters}
              >
                <Text style={styles.clearFiltersText}>{t('rides.clearFilters')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyFiltersButton}
                onPress={() => setShowFiltersModal(false)}
              >
                <Text style={styles.applyFiltersText}>{t('rides.applyFilters')}</Text>
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
    backgroundColor: colors.muted,
  },
  header: {
    backgroundColor: colors.background,
    padding: 20,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.foreground,
  },
  filterIconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.primary,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: colors.background,
    fontSize: 11,
    fontWeight: '700',
  },
  filterWrapper: {
    backgroundColor: colors.background,
    paddingBottom: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.mutedForeground,
  },
  filterTextActive: {
    color: colors.background,
  },
  listContainer: {
    flex: 1,
  },
  list: {
    padding: 16,
    paddingTop: 8,
  },
  rideCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
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
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  fareText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    color: colors.foreground,
    marginLeft: 8,
  },
  rideFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  distanceText: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    color: colors.mutedForeground,
    marginTop: 16,
    textAlign: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245, 245, 245, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBox: {
    backgroundColor: colors.card,
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderRadius: radius.lg,
    alignItems: 'center',
    ...shadows.lg,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
    color: colors.mutedForeground,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    padding: 24,
    paddingBottom: 40,
    ...shadows.lg,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.foreground,
    marginTop: 12,
  },
  rideInfo: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
  },
  locationTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  locationLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 15,
    color: colors.foreground,
    fontWeight: '500',
  },
  locationDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  rideDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  detailItem: {
    flex: 1,
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
  fareValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: radius.lg,
    gap: 8,
  },
  declineButton: {
    backgroundColor: colors.destructive + '15',
  },
  declineText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.destructive,
  },
  acceptButton: {
    backgroundColor: colors.primary,
  },
  acceptText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },
  // Filter Modal Styles
  filtersModalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    maxHeight: '85%',
    ...shadows.lg,
  },
  filtersModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filtersModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.foreground,
  },
  filtersScrollView: {
    padding: 20,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 12,
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceInputContainer: {
    flex: 1,
  },
  priceInputLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 6,
  },
  priceInput: {
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  priceSeparator: {
    paddingHorizontal: 12,
    paddingTop: 18,
  },
  priceSeparatorText: {
    fontSize: 18,
    color: colors.mutedForeground,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.mutedForeground,
  },
  optionChipTextActive: {
    color: colors.background,
  },
  filterActions: {
    flexDirection: 'row',
    padding: 20,
    paddingBottom: 32,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  clearFiltersButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearFiltersText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  applyFiltersButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyFiltersText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },
});
