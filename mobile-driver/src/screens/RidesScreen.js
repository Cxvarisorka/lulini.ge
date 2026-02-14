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
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';

export default function RidesScreen({ navigation }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { activeRides, addActiveRide, loadAllRides } = useDriver();
  const { newRideRequest, clearRideRequest } = useSocket();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);
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
      const { rides } = await loadAllRides(forceRefresh);

      if (selectedFilter === 'active') {
        // Active rides are already managed by loadAllRides
      } else {
        let filteredRides = rides;
        if (selectedFilter === 'completed') {
          filteredRides = rides.filter(ride => ride.status === 'completed');
        } else if (selectedFilter === 'cancelled') {
          filteredRides = rides.filter(ride => ride.status === 'cancelled');
        }
        setAllRides(filteredRides);
      }
    } catch (error) {
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
      activeOpacity={0.7}
    >
      <View style={styles.rideHeader}>
        <View style={[styles.statusBadge, { backgroundColor: `${colors.status[item.status]}15` }]}>
          <View style={[styles.statusDot, { backgroundColor: colors.status[item.status] }]} />
          <Text style={[styles.statusText, { color: colors.status[item.status] }]} numberOfLines={1}>
            {t(`rides.${item.status}`)}
          </Text>
        </View>
        <Text style={styles.fareText}>${item.quote?.totalPrice?.toFixed(2)}</Text>
      </View>

      <View style={styles.locationContainer}>
        <View style={styles.locationRow}>
          <View style={[styles.locationDot, { backgroundColor: colors.success }]} />
          <Text style={styles.locationText} numberOfLines={1}>
            {item.pickup?.address}
          </Text>
        </View>

        <View style={styles.locationLine} />

        <View style={styles.locationRow}>
          <View style={[styles.locationDot, { backgroundColor: colors.destructive }]} />
          <Text style={styles.locationText} numberOfLines={1}>
            {item.dropoff?.address}
          </Text>
        </View>
      </View>

      <View style={styles.rideFooter}>
        <View style={styles.rideMetaItem}>
          <Ionicons name="navigate-outline" size={14} color={colors.mutedForeground} />
          <Text style={styles.rideMetaText}>{item.quote?.distanceText}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );

  const applyAdvancedFilters = useCallback((rides) => {
    let filtered = [...rides];

    if (minPrice) {
      const min = parseFloat(minPrice);
      filtered = filtered.filter(ride => (ride.quote?.totalPrice || 0) >= min);
    }
    if (maxPrice) {
      const max = parseFloat(maxPrice);
      filtered = filtered.filter(ride => (ride.quote?.totalPrice || 0) <= max);
    }

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
    { key: 'active', label: t('rides.activeTab'), icon: 'flash' },
    { key: 'all', label: t('rides.allTab'), icon: 'list' },
    { key: 'completed', label: t('rides.completedTab'), icon: 'checkmark-circle' },
    { key: 'cancelled', label: t('rides.cancelledTab'), icon: 'close-circle' },
  ];

  const ridesToDisplay = getRidesToDisplay();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>{t('rides.myRides')}</Text>
          <TouchableOpacity
            style={styles.filterIconButton}
            onPress={() => setShowFiltersModal(true)}
          >
            <Ionicons name="options-outline" size={22} color={colors.foreground} />
            {activeFiltersCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Filter Tabs */}
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
              <Ionicons
                name={filter.icon}
                size={16}
                color={selectedFilter === filter.key ? colors.primaryForeground : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.filterText,
                  selectedFilter === filter.key && styles.filterTextActive,
                ]}
                numberOfLines={1}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {ridesToDisplay.length === 0 && !loading ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="car-outline" size={48} color={colors.mutedForeground} />
            </View>
            <Text style={styles.emptyTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
              {selectedFilter === 'active' ? t('home.noActiveRides') : t('rides.noRidesFound')}
            </Text>
            <Text style={styles.emptySubtitle} numberOfLines={2}>
              {selectedFilter === 'active'
                ? t('home.waitingForRides') || 'Waiting for ride requests'
                : t('rides.tryDifferentFilter') || 'Try a different filter'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={ridesToDisplay}
            renderItem={renderRideItem}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        )}

        {loading && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>{t('common.loading')}</Text>
            </View>
          </View>
        )}
      </View>

      {/* New Ride Request Modal */}
      <Modal
        visible={!!newRideRequest}
        animationType="slide"
        transparent={true}
        onRequestClose={handleDeclineRide}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + spacing['3xl'] }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconBadge}>
                <Ionicons name="car" size={28} color={colors.primaryForeground} />
              </View>
              <Text style={styles.modalTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('rides.newRequest')}</Text>
            </View>

            {newRideRequest && (
              <>
                <View style={styles.rideInfo}>
                  <View style={styles.modalLocationRow}>
                    <View style={[styles.locationDot, { backgroundColor: colors.success }]} />
                    <View style={styles.locationTextContainer}>
                      <Text style={styles.locationLabel} numberOfLines={1}>{t('rides.pickup')}</Text>
                      <Text style={styles.locationAddress} numberOfLines={2}>{newRideRequest.pickup?.address}</Text>
                    </View>
                  </View>

                  <View style={styles.modalLocationLine} />

                  <View style={styles.modalLocationRow}>
                    <View style={[styles.locationDot, { backgroundColor: colors.destructive }]} />
                    <View style={styles.locationTextContainer}>
                      <Text style={styles.locationLabel} numberOfLines={1}>{t('rides.dropoff')}</Text>
                      <Text style={styles.locationAddress} numberOfLines={2}>{newRideRequest.dropoff?.address}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.rideDetails}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('rides.distance')}</Text>
                    <Text style={styles.detailValue} numberOfLines={1}>{newRideRequest.quote?.distanceText}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('rides.duration')}</Text>
                    <Text style={styles.detailValue} numberOfLines={1}>{newRideRequest.quote?.durationText}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('rides.fare')}</Text>
                    <Text style={styles.fareValue} numberOfLines={1}>${newRideRequest.quote?.totalPrice}</Text>
                  </View>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.declineButton}
                    onPress={handleDeclineRide}
                    disabled={accepting}
                  >
                    <Ionicons name="close" size={20} color={colors.destructive} />
                    <Text style={styles.declineText} numberOfLines={1}>{t('common.decline')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.acceptButton, accepting && styles.acceptButtonDisabled]}
                    onPress={handleAcceptRide}
                    disabled={accepting}
                  >
                    {accepting ? (
                      <ActivityIndicator color={colors.primaryForeground} />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={20} color={colors.primaryForeground} />
                        <Text style={styles.acceptText} numberOfLines={1}>{t('common.accept')}</Text>
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
              <Text style={styles.filtersModalTitle} numberOfLines={1}>{t('rides.filters')}</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowFiltersModal(false)}
              >
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filtersScrollView} showsVerticalScrollIndicator={false}>
              {/* Price Range */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle} numberOfLines={1}>{t('rides.priceRange')}</Text>
                <View style={styles.priceInputRow}>
                  <View style={styles.priceInputContainer}>
                    <Text style={styles.priceInputLabel} numberOfLines={1}>{t('rides.minPrice')}</Text>
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
                    <Text style={styles.priceInputLabel} numberOfLines={1}>{t('rides.maxPrice')}</Text>
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
                <Text style={styles.filterSectionTitle} numberOfLines={1}>{t('rides.dateRange')}</Text>
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
                <Text style={styles.filterSectionTitle} numberOfLines={1}>{t('rides.sortBy')}</Text>
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
            <View style={[styles.filterActions, { paddingBottom: insets.bottom + spacing['2xl'] }]}>
              <TouchableOpacity
                style={styles.clearFiltersButton}
                onPress={clearFilters}
              >
                <Text style={styles.clearFiltersText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('rides.clearFilters')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyFiltersButton}
                onPress={() => setShowFiltersModal(false)}
              >
                <Text style={styles.applyFiltersText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('rides.applyFilters')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  header: {
    backgroundColor: colors.background,
    paddingBottom: spacing.md,
    borderBottomLeftRadius: radius['2xl'],
    borderBottomRightRadius: radius['2xl'],
    ...shadows.sm,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.display,
    fontWeight: '700',
    color: colors.foreground,
  },
  filterIconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.primary,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: colors.primaryForeground,
    fontSize: 10,
    fontWeight: '700',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    gap: spacing.xs,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.mutedForeground,
  },
  filterTextActive: {
    color: colors.primaryForeground,
  },
  content: {
    flex: 1,
  },
  list: {
    padding: spacing.lg,
    paddingTop: spacing.md,
  },
  rideCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    gap: spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    ...typography.captionSmall,
    fontWeight: '600',
  },
  fareText: {
    ...typography.h2,
    fontWeight: '700',
    color: colors.foreground,
  },
  locationContainer: {
    marginBottom: spacing.md,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.md,
  },
  locationLine: {
    width: 2,
    height: 16,
    backgroundColor: colors.border,
    marginLeft: 4,
    marginVertical: spacing.xs,
  },
  locationText: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.foreground,
  },
  rideFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rideMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rideMetaText: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing['3xl'],
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  emptyTitle: {
    ...typography.h2,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245, 245, 245, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBox: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing.xl,
    borderRadius: radius.lg,
    alignItems: 'center',
    ...shadows.lg,
  },
  loadingText: {
    marginTop: spacing.md,
    ...typography.bodySmall,
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
    padding: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalIconBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h1,
    fontWeight: '700',
    color: colors.foreground,
  },
  rideInfo: {
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  modalLocationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  locationTextContainer: {
    flex: 1,
    marginLeft: spacing.md,
  },
  locationLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  locationAddress: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.foreground,
  },
  modalLocationLine: {
    width: 2,
    height: 20,
    backgroundColor: colors.border,
    marginLeft: 4,
    marginVertical: spacing.sm,
  },
  rideDetails: {
    flexDirection: 'row',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  detailItem: {
    flex: 1,
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  detailLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  detailValue: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.foreground,
  },
  fareValue: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.success,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: `${colors.destructive}15`,
    gap: spacing.sm,
  },
  declineText: {
    ...typography.button,
    color: colors.destructive,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.success,
    gap: spacing.sm,
  },
  acceptButtonDisabled: {
    opacity: 0.6,
  },
  acceptText: {
    ...typography.button,
    color: colors.primaryForeground,
  },
  // Filter Modal Styles
  filtersModalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    maxHeight: '85%',
  },
  filtersModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filtersModalTitle: {
    ...typography.h1,
    fontWeight: '700',
    color: colors.foreground,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filtersScrollView: {
    padding: spacing.lg,
  },
  filterSection: {
    marginBottom: spacing.xl,
  },
  filterSectionTitle: {
    ...typography.label,
    fontWeight: '600',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceInputContainer: {
    flex: 1,
  },
  priceInputLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginBottom: spacing.xs,
  },
  priceInput: {
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.foreground,
  },
  priceSeparator: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  priceSeparatorText: {
    ...typography.h2,
    color: colors.mutedForeground,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  optionChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
  },
  optionChipActive: {
    backgroundColor: colors.primary,
  },
  optionChipText: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.mutedForeground,
  },
  optionChipTextActive: {
    color: colors.primaryForeground,
  },
  filterActions: {
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  clearFiltersButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearFiltersText: {
    ...typography.button,
    color: colors.foreground,
  },
  applyFiltersButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyFiltersText: {
    ...typography.button,
    color: colors.primaryForeground,
  },
});
