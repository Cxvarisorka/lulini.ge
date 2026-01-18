import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { colors, shadows, radius } from '../theme/colors';
import { taxiAPI } from '../services/api';

const STATUS_COLORS = {
  pending: colors.status.pending,
  accepted: colors.info,
  arrived: colors.info,
  in_progress: colors.status.active,
  inProgress: colors.status.active,
  completed: colors.status.completed,
  cancelled: colors.status.cancelled,
};

export default function TaxiHistoryScreen({ navigation }) {
  const { t } = useTranslation();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchRides();
  }, []);

  const fetchRides = async () => {
    try {
      const response = await taxiAPI.getMyRides();
      if (response.data.success) {
        setRides(response.data.data.rides || []);
      }
    } catch (error) {
      console.log('Error fetching rides:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchRides();
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status) => {
    return STATUS_COLORS[status] || colors.mutedForeground;
  };

  const renderRideItem = ({ item }) => (
    <TouchableOpacity style={styles.rideCard}>
      <View style={styles.rideHeader}>
        <View style={styles.dateContainer}>
          <Ionicons name="calendar-outline" size={16} color={colors.mutedForeground} />
          <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {t(`taxi.status.${item.status}`)}
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

      <View style={styles.rideFooter}>
        <View style={styles.footerItem}>
          <Ionicons name="car-outline" size={16} color={colors.mutedForeground} />
          <Text style={styles.footerText}>{t(`taxi.${item.vehicleType || 'economy'}`)}</Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons name="cash-outline" size={16} color={colors.mutedForeground} />
          <Text style={styles.footerText}>
            ${item.fare ? item.fare.toFixed(2) : (item.quote?.totalPrice || '0.00')}
          </Text>
        </View>
        <View style={styles.footerItem}>
          <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
          <Text style={styles.footerText}>
            {item.quote?.durationText || `${item.quote?.duration || 0} min`}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="car-outline" size={64} color={colors.mutedForeground} />
      </View>
      <Text style={styles.emptyTitle}>{t('taxi.noRides')}</Text>
      <Text style={styles.emptyDescription}>{t('taxi.noRidesDesc')}</Text>
      <TouchableOpacity
        style={styles.bookButton}
        onPress={() => navigation.navigate('Taxi')}
      >
        <Ionicons name="add" size={20} color={colors.background} />
        <Text style={styles.bookButtonText}>{t('home.callTaxi')}</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={rides}
        renderItem={renderRideItem}
        keyExtractor={(item) => item._id || item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.secondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.secondary,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  rideCard: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: 16,
    marginBottom: 12,
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
    fontSize: 13,
    color: colors.mutedForeground,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: 12,
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
    fontSize: 11,
    color: colors.mutedForeground,
    marginBottom: 2,
  },
  routeAddress: {
    fontSize: 14,
    color: colors.foreground,
    fontWeight: '500',
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
    fontSize: 13,
    color: colors.mutedForeground,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    ...shadows.sm,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
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
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
