import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, shadows, radius, useTypography } from '../theme/colors';
import { rentalAPI } from '../services/api';

const CATEGORIES = ['all', 'economy', 'business', 'luxury', 'suv'];

export default function RentalsScreen({ navigation }) {
const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
    const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [cars, setCars] = useState([]);
  const [filteredCars, setFilteredCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchCars();
  }, []);

  useEffect(() => {
    filterCars();
  }, [selectedCategory, searchQuery, cars]);

  const fetchCars = async () => {
    try {
      const response = await rentalAPI.getCars();
      if (response.data.success) {
        setCars(response.data.data.cars || []);
      }
    } catch (error) {
      // Error fetching cars
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filterCars = () => {
    let result = [...cars];

    if (selectedCategory !== 'all') {
      result = result.filter(car => car.category === selectedCategory);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(car =>
        car.brand?.toLowerCase().includes(query) ||
        car.model?.toLowerCase().includes(query)
      );
    }

    setFilteredCars(result);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchCars();
  };

  const renderCarItem = ({ item }) => (
    <TouchableOpacity
      style={styles.carCard}
      onPress={() => navigation.navigate('RentalDetail', { car: item })}
    >
      <View style={styles.carImageContainer}>
        {item.images && item.images.length > 0 ? (
          <Image
            source={{ uri: item.images[0] }}
            style={styles.carImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.carImagePlaceholder}>
            <Ionicons name="car" size={48} color={colors.mutedForeground} />
          </View>
        )}
        <View style={[
          styles.availabilityBadge,
          { backgroundColor: item.available ? colors.success + '20' : colors.destructive + '20' }
        ]}>
          <Text style={[
            styles.availabilityText,
            { color: item.available ? colors.success : colors.destructive }
          ]}>
            {item.available ? t('rentals.available') : t('rentals.unavailable')}
          </Text>
        </View>
      </View>

      <View style={styles.carInfo}>
        <Text style={styles.carName}>{item.brand} {item.model}</Text>
        <Text style={styles.carYear}>{item.year}</Text>

        <View style={styles.carSpecs}>
          <View style={styles.specItem}>
            <Ionicons name="people-outline" size={14} color={colors.mutedForeground} />
            <Text style={styles.specText}>{item.passengers}</Text>
          </View>
          <View style={styles.specItem}>
            <Ionicons name="briefcase-outline" size={14} color={colors.mutedForeground} />
            <Text style={styles.specText}>{item.luggage}</Text>
          </View>
          <View style={styles.specItem}>
            <Ionicons name="cog-outline" size={14} color={colors.mutedForeground} />
            <Text style={styles.specText}>
              {item.transmission === 'automatic' ? t('rentals.automatic') : t('rentals.manual')}
            </Text>
          </View>
        </View>

        <View style={styles.carFooter}>
          <View style={styles.priceContainer}>
            <Text style={styles.priceValue}>${item.pricePerDay}</Text>
            <Text style={styles.priceLabel}>/{t('rentals.perDay')}</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.bookButton,
              !item.available && styles.bookButtonDisabled
            ]}
            onPress={() => navigation.navigate('RentalDetail', { car: item })}
            disabled={!item.available}
          >
            <Text style={styles.bookButtonText}>{t('rentals.viewDetails')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.background} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="car-outline" size={64} color={colors.mutedForeground} />
      </View>
      <Text style={styles.emptyTitle}>{t('common.noResults')}</Text>
      <Text style={styles.emptyDescription}>
        {searchQuery || selectedCategory !== 'all'
          ? t('rentals.noResults')
          : t('rentals.noCars')}
      </Text>
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color={colors.mutedForeground} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('common.search')}
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Category Filters */}
      <View style={styles.categoriesContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryButton,
                selectedCategory === category && styles.categoryButtonActive,
              ]}
              onPress={() => setSelectedCategory(category)}
            >
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === category && styles.categoryTextActive,
                ]}
              >
                {t(`rentals.categories.${category}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Cars List */}
      <FlatList
        data={filteredCars}
        renderItem={renderCarItem}
        keyExtractor={(item) => item._id || item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyList}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (typography) => StyleSheet.create({
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
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: colors.background,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    ...typography.h3,
    color: colors.foreground,
  },
  categoriesContainer: {
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  categoryButtonActive: {
    backgroundColor: colors.primary,
  },
  categoryText: {
    ...typography.bodyMedium,
    color: colors.mutedForeground,
  },
  categoryTextActive: {
    color: colors.background,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  carCard: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    marginBottom: 16,
    overflow: 'hidden',
    ...shadows.sm,
  },
  carImageContainer: {
    position: 'relative',
  },
  carImage: {
    width: '100%',
    height: 180,
  },
  carImagePlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  availabilityBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  availabilityText: {
    ...typography.caption,
    fontWeight: '600',
  },
  carInfo: {
    padding: 16,
  },
  carName: {
    ...typography.h1,
    color: colors.foreground,
    marginBottom: 4,
  },
  carYear: {
    ...typography.body,
    color: colors.mutedForeground,
    marginBottom: 12,
  },
  carSpecs: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  specItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  specText: {
    marginLeft: 4,
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  carFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceValue: {
    ...typography.display,
    fontSize: 22,
    fontWeight: '700',
    color: colors.foreground,
  },
  priceLabel: {
    ...typography.body,
    color: colors.mutedForeground,
    marginLeft: 2,
  },
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.lg,
  },
  bookButtonDisabled: {
    backgroundColor: colors.mutedForeground,
  },
  bookButtonText: {
    color: colors.background,
    ...typography.button,
    marginRight: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
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
    ...typography.display,
    color: colors.foreground,
    marginBottom: 8,
  },
  emptyDescription: {
    ...typography.body,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
});
