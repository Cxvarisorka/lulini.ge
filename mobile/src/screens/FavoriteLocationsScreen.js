import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Keyboard,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, shadows, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { favoritesAPI } from '../services/api';
import { searchPlaces } from '../services/googleMaps';

const MAX_FAVORITES = 10;

const TYPE_ICONS = {
  home: 'home',
  work: 'briefcase',
  custom: 'star',
};

function getTypeColors(colors) {
  return {
    home: colors.success,
    work: colors.info,
    custom: colors.warning,
  };
}

function FavoriteItem({ item, onDelete, styles, typography, colors }) {
  const { t } = useTranslation();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [swiped, setSwiped] = useState(false);

  const handleSwipeDelete = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: -80,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSwiped(true));
  }, [slideAnim]);

  const handleUnswipe = useCallback(() => {
    setSwiped(false);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      t('favorites.deleteTitle'),
      t('favorites.deleteMessage', { name: item.name }),
      [
        { text: t('common.cancel'), style: 'cancel', onPress: handleUnswipe },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => onDelete(item._id),
        },
      ]
    );
  }, [t, item, onDelete, handleUnswipe]);

  const iconName = TYPE_ICONS[item.type] || 'star';
  const typeColors = getTypeColors(colors);
  const iconColor = typeColors[item.type] || colors.warning;

  return (
    <View style={styles.swipeContainer}>
      {/* Delete action revealed on swipe */}
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={handleDelete}
        accessibilityRole="button"
        accessibilityLabel={t('favorites.deleteAccessibility', { name: item.name })}
      >
        <Ionicons name="trash-outline" size={22} color={colors.background} />
      </TouchableOpacity>

      <Animated.View
        style={[styles.itemRow, { transform: [{ translateX: slideAnim }] }]}
      >
        <View style={[styles.iconContainer, { backgroundColor: iconColor + '18' }]}>
          <Ionicons name={iconName} size={22} color={iconColor} />
        </View>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.itemAddress} numberOfLines={1}>{item.address}</Text>
        </View>
        <TouchableOpacity
          onPress={swiped ? handleUnswipe : handleSwipeDelete}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.delete')}
        >
          <Ionicons
            name={swiped ? 'close' : 'trash-outline'}
            size={20}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function FavoriteLocationsScreen({ navigation }) {
  const { t } = useTranslation();
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);

  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState('');
  const [addType, setAddType] = useState('custom');
  const [addQuery, setAddQuery] = useState('');
  const [addSuggestions, setAddSuggestions] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const searchIdRef = useRef(0);

  const loadFavorites = useCallback(async () => {
    try {
      const res = await favoritesAPI.getFavorites();
      if (res.data.success) {
        setFavorites(res.data.data || []);
      }
    } catch (e) {
      if (__DEV__) console.warn('[Favorites] load error:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  // Debounced place search
  useEffect(() => {
    if (addQuery.length < 3) {
      setAddSuggestions([]);
      return;
    }
    const id = ++searchIdRef.current;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchPlaces(addQuery, null);
        if (id === searchIdRef.current) setAddSuggestions(results);
      } catch {
        if (id === searchIdRef.current) setAddSuggestions([]);
      } finally {
        if (id === searchIdRef.current) setIsSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [addQuery]);

  const handleDelete = useCallback(async (id) => {
    try {
      await favoritesAPI.deleteFavorite(id);
      setFavorites(prev => prev.filter(f => f._id !== id));
    } catch (e) {
      Alert.alert(t('common.error'), t('errors.somethingWentWrong'));
    }
  }, [t]);

  const handleSelectPlace = useCallback((place) => {
    setSelectedPlace(place);
    setAddQuery(place.description);
    setAddSuggestions([]);
    Keyboard.dismiss();
  }, []);

  const handleSave = useCallback(async () => {
    if (!addName.trim()) {
      Alert.alert(t('common.error'), t('favorites.nameRequired'));
      return;
    }
    if (!selectedPlace) {
      Alert.alert(t('common.error'), t('favorites.addressRequired'));
      return;
    }
    if (favorites.length >= MAX_FAVORITES) {
      Alert.alert(t('common.error'), t('favorites.maxReached', { max: MAX_FAVORITES }));
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: addName.trim(),
        type: addType,
        address: selectedPlace.description,
        lat: selectedPlace.coordinates?.latitude,
        lng: selectedPlace.coordinates?.longitude,
        placeId: selectedPlace.placeId,
      };
      const res = await favoritesAPI.addFavorite(payload);
      if (res.data.success) {
        setFavorites(prev => [...prev, res.data.data]);
        setShowAddForm(false);
        setAddName('');
        setAddType('custom');
        setAddQuery('');
        setSelectedPlace(null);
        setAddSuggestions([]);
      }
    } catch (e) {
      Alert.alert(t('common.error'), t('errors.somethingWentWrong'));
    } finally {
      setIsSaving(false);
    }
  }, [addName, addType, selectedPlace, favorites.length, t]);

  const canAdd = favorites.length < MAX_FAVORITES;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={favorites}
        keyExtractor={item => item._id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            {/* Header info */}
            <View style={styles.headerInfo}>
              <Text style={styles.countText}>
                {favorites.length}/{MAX_FAVORITES} {t('favorites.saved')}
              </Text>
              {canAdd && (
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => setShowAddForm(prev => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={t('favorites.addNew')}
                  accessibilityHint={t('favorites.addNewHint')}
                >
                  <Ionicons
                    name={showAddForm ? 'close' : 'add'}
                    size={20}
                    color={colors.background}
                  />
                  <Text style={styles.addButtonText}>
                    {showAddForm ? t('common.cancel') : t('favorites.addNew')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Add Form */}
            {showAddForm && (
              <View style={styles.addForm}>
                <Text style={styles.formTitle}>{t('favorites.addNew')}</Text>

                {/* Name */}
                <Text style={styles.fieldLabel}>{t('favorites.name')}</Text>
                <TextInput
                  style={styles.textInput}
                  value={addName}
                  onChangeText={setAddName}
                  placeholder={t('favorites.namePlaceholder')}
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="words"
                  accessibilityLabel={t('favorites.name')}
                />

                {/* Type Selector */}
                <Text style={styles.fieldLabel}>{t('favorites.type')}</Text>
                <View style={styles.typeRow}>
                  {['home', 'work', 'custom'].map(type => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeChip,
                        addType === type && styles.typeChipActive,
                      ]}
                      onPress={() => setAddType(type)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: addType === type }}
                      accessibilityLabel={t(`favorites.types.${type}`)}
                    >
                      <Ionicons
                        name={TYPE_ICONS[type]}
                        size={16}
                        color={addType === type ? colors.background : getTypeColors(colors)[type]}
                      />
                      <Text style={[
                        styles.typeChipText,
                        addType === type && styles.typeChipTextActive,
                      ]}>
                        {t(`favorites.types.${type}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Address Search */}
                <Text style={styles.fieldLabel}>{t('favorites.address')}</Text>
                <View style={styles.searchRow}>
                  <TextInput
                    style={[styles.textInput, styles.searchInput]}
                    value={addQuery}
                    onChangeText={(text) => {
                      setAddQuery(text);
                      setSelectedPlace(null);
                    }}
                    placeholder={t('favorites.searchAddress')}
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="words"
                    autoCorrect={false}
                    accessibilityLabel={t('favorites.address')}
                  />
                  {isSearching && (
                    <ActivityIndicator
                      size="small"
                      color={colors.primary}
                      style={styles.searchSpinner}
                    />
                  )}
                  {selectedPlace && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} style={styles.searchSpinner} />
                  )}
                </View>

                {/* Suggestions */}
                {addSuggestions.length > 0 && (
                  <View style={styles.suggestionsBox}>
                    {addSuggestions.map((place, i) => (
                      <TouchableOpacity
                        key={place.placeId || i}
                        style={styles.suggestionRow}
                        onPress={() => handleSelectPlace(place)}
                        accessibilityRole="button"
                        accessibilityLabel={place.description}
                      >
                        <Ionicons name="location-outline" size={16} color={colors.primary} />
                        <View style={styles.suggestionText}>
                          <Text style={styles.suggestionMain} numberOfLines={1}>
                            {place.mainText}
                          </Text>
                          <Text style={styles.suggestionSub} numberOfLines={1}>
                            {place.secondaryText}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Save Button */}
                <TouchableOpacity
                  style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                  onPress={handleSave}
                  disabled={isSaving}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.save')}
                  accessibilityState={{ disabled: isSaving }}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color={colors.background} />
                  ) : (
                    <Text style={styles.saveButtonText}>{t('common.save')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Section title */}
            {favorites.length > 0 && (
              <Text style={styles.sectionTitle}>{t('favorites.myPlaces')}</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <FavoriteItem
            item={item}
            onDelete={handleDelete}
            styles={styles}
            typography={typography}
            colors={colors}
          />
        )}
        ListEmptyComponent={
          !showAddForm ? (
            <View style={styles.emptyState}>
              <Ionicons name="bookmark-outline" size={56} color={colors.border} />
              <Text style={styles.emptyTitle}>{t('favorites.emptyTitle')}</Text>
              <Text style={styles.emptyDesc}>{t('favorites.emptyDesc')}</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const createStyles = (typography, colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  countText: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    gap: 6,
  },
  addButtonText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.background,
  },
  addForm: {
    backgroundColor: colors.muted,
    borderRadius: radius.xl,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formTitle: {
    ...typography.h3,
    color: colors.foreground,
    marginBottom: 14,
  },
  fieldLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginBottom: 6,
    marginTop: 10,
  },
  textInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...typography.bodyMedium,
    color: colors.foreground,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
  },
  searchSpinner: {
    marginLeft: 8,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  typeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeChipText: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.foreground,
  },
  typeChipTextActive: {
    color: colors.background,
  },
  suggestionsBox: {
    marginTop: 6,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  suggestionText: {
    flex: 1,
  },
  suggestionMain: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.foreground,
  },
  suggestionSub: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginTop: 1,
  },
  saveButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    ...typography.button,
    color: colors.background,
    fontWeight: '600',
  },
  sectionTitle: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginBottom: 10,
    marginTop: 4,
  },
  // List items
  swipeContainer: {
    marginBottom: 1,
    overflow: 'hidden',
    borderRadius: radius.lg,
    position: 'relative',
  },
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: colors.destructive,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 2,
  },
  itemAddress: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
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
});
