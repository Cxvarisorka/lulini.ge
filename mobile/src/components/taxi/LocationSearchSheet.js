import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, shadows } from '../../theme/colors';
import { searchPlaces, getPlaceDetails, isGoogleMapsConfigured, isMapboxConfigured } from '../../services/googleMaps';

export default function LocationSearchSheet({
  pickup,
  destination,
  onDestinationChange,
  onDestinationSelect,
  onPickupRefresh,
  isLoadingLocation,
  userLocation,
  onSelectOnMap, // New prop for map pin selection
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState(destination || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const scrollViewRef = useRef(null);
  const inputRef = useRef(null);

  // Debounce search
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchPlaces(searchQuery, userLocation);
        setSuggestions(results);
      } catch (error) {
        console.log('Search error:', error);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, userLocation]);

  // Handle text change
  const handleTextChange = useCallback((text) => {
    setSearchQuery(text);
    setSelectedPlace(null);
  }, []);

  // Handle place selection from suggestions
  const handlePlaceSelect = useCallback(async (place) => {
    Keyboard.dismiss();
    setIsSearching(true);
    try {
      // Mapbox already returns coordinates, no need for extra API call
      if (place.coordinates) {
        setSearchQuery(place.description);
        setSelectedPlace({
          ...place,
          coordinates: place.coordinates,
        });
        setSuggestions([]);
        // Pass the place with coordinates to parent
        onDestinationSelect(place.description, place.coordinates);
      } else {
        // Fallback for Google results - need to get details
        const details = await getPlaceDetails(place.placeId);
        if (details) {
          setSearchQuery(place.description);
          setSelectedPlace(details);
          setSuggestions([]);
          onDestinationSelect(place.description, details.coordinates);
        } else {
          // Fallback if place details fail
          setSearchQuery(place.description);
          setSuggestions([]);
          onDestinationChange(place.description);
        }
      }
    } catch (error) {
      console.log('Error getting place details:', error);
      setSearchQuery(place.description);
      setSuggestions([]);
      onDestinationChange(place.description);
    } finally {
      setIsSearching(false);
    }
  }, [onDestinationSelect, onDestinationChange]);

  // Handle manual submit (when typing address without selecting)
  const handleSubmit = useCallback(() => {
    if (searchQuery.length > 3) {
      Keyboard.dismiss();
      setSuggestions([]);
      onDestinationChange(searchQuery);
    }
  }, [searchQuery, onDestinationChange]);

  const recentPlaces = [
    { id: 1, name: t('taxi.home'), address: 'Tsereteli Street, Kutaisi', icon: 'home-outline' },
    { id: 2, name: t('taxi.work'), address: 'Kutaisi Central Park, Kutaisi', icon: 'briefcase-outline' },
  ];

  const googleConfigured = isGoogleMapsConfigured();
  const mapboxConfigured = isMapboxConfigured();

  // Scroll to top when input is focused to ensure visibility
  const handleInputFocus = useCallback(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }, 100);
  }, []);

  return (
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.scrollContent}
    >
      {/* Location Input Section */}
      <View style={styles.searchContainer}>
        <View style={styles.inputWrapper}>
          {/* Dot Indicators */}
          <View style={styles.dotIndicator}>
            <View style={[styles.dot, styles.greenDot]} />
            <View style={styles.dotLine} />
            <View style={[styles.dot, styles.redDot]} />
          </View>

          <View style={styles.inputsColumn}>
            {/* Pickup Location (Current Location) */}
            <TouchableOpacity style={styles.locationInput} onPress={onPickupRefresh}>
              <Text style={styles.locationLabel}>{t('taxi.currentLocation')}</Text>
              <View style={styles.locationTextRow}>
                <Text style={styles.locationText} numberOfLines={1}>
                  {isLoadingLocation ? t('taxi.gettingLocation') : (pickup?.address || t('taxi.gettingLocation'))}
                </Text>
                <Ionicons name="refresh" size={16} color={colors.mutedForeground} />
              </View>
            </TouchableOpacity>

            <View style={styles.inputDivider} />

            {/* Destination Input */}
            <View style={styles.destinationContainer}>
              <Text style={styles.locationLabel}>{t('taxi.whereTo')}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  ref={inputRef}
                  style={styles.destinationInput}
                  placeholder={t('taxi.enterDestination')}
                  placeholderTextColor={colors.mutedForeground}
                  value={searchQuery}
                  onChangeText={handleTextChange}
                  onFocus={handleInputFocus}
                  selectTextOnFocus={false}
                  autoCorrect={false}
                  autoCapitalize="words"
                  returnKeyType="search"
                  blurOnSubmit={true}
                  onSubmitEditing={handleSubmit}
                />
                {isSearching && (
                  <ActivityIndicator size="small" color={colors.primary} style={styles.searchingIndicator} />
                )}
              </View>

              {/* Search button (show when no suggestions and query is long enough) */}
              {searchQuery.length > 3 && suggestions.length === 0 && !isSearching && (
                <TouchableOpacity style={styles.searchButton} onPress={handleSubmit}>
                  <Ionicons name="search" size={18} color={colors.background} />
                  <Text style={styles.searchButtonText}>{t('common.search')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Place Suggestions */}
      {suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <View style={styles.sectionHeader}>
            <Ionicons name="location-outline" size={18} color={colors.mutedForeground} />
            <Text style={styles.sectionTitle}>{t('taxi.suggestions') || 'Suggestions'}</Text>
          </View>
          {suggestions.map((place, index) => (
            <TouchableOpacity
              key={place.placeId || index}
              style={styles.suggestionItem}
              onPress={() => handlePlaceSelect(place)}
            >
              <View style={styles.suggestionIcon}>
                <Ionicons name="location" size={20} color={colors.primary} />
              </View>
              <View style={styles.suggestionDetails}>
                <Text style={styles.suggestionMain} numberOfLines={1}>{place.mainText}</Text>
                <Text style={styles.suggestionSecondary} numberOfLines={1}>{place.secondaryText}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Google API Notice (if not configured) */}
      {!googleConfigured && searchQuery.length > 0 && (
        <View style={styles.apiNotice}>
          <Ionicons name="information-circle-outline" size={16} color={colors.mutedForeground} />
          <Text style={styles.apiNoticeText}>
            {t('taxi.googleApiNotConfigured') || 'Google Places API not configured. Using manual search.'}
          </Text>
        </View>
      )}

      {/* Recent Places Section (show when no suggestions) */}
      {suggestions.length === 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Ionicons name="time-outline" size={18} color={colors.mutedForeground} />
            <Text style={styles.sectionTitle}>{t('taxi.recentPlaces')}</Text>
          </View>

          {recentPlaces.map((place) => (
            <TouchableOpacity
              key={place.id}
              style={styles.placeItem}
              onPress={() => {
                Keyboard.dismiss();
                setSearchQuery(place.address);
                setSuggestions([]);
                onDestinationSelect(place.address);
              }}
            >
              <View style={styles.placeIcon}>
                <Ionicons name={place.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.placeDetails}>
                <Text style={styles.placeName}>{place.name}</Text>
                <Text style={styles.placeAddress} numberOfLines={1}>{place.address}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}

          {/* Select on Map Option */}
          <TouchableOpacity
            style={styles.mapSelectButton}
            onPress={() => {
              Keyboard.dismiss();
              if (onSelectOnMap) {
                onSelectOnMap();
              }
            }}
          >
            <Ionicons name="map-outline" size={20} color={colors.primary} />
            <Text style={styles.mapSelectText}>{t('taxi.selectOnMap')}</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Powered by attribution */}
      {suggestions.length > 0 && (
        <View style={styles.poweredBy}>
          <Text style={styles.poweredByText}>
            {mapboxConfigured ? 'Powered by Mapbox' : (googleConfigured ? 'Powered by Google' : '')}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  searchContainer: {
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  dotIndicator: {
    width: 24,
    alignItems: 'center',
    paddingVertical: 16,
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
    marginVertical: 6,
  },
  inputsColumn: {
    flex: 1,
    marginLeft: 8,
  },
  locationInput: {
    paddingVertical: 12,
  },
  locationLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  locationTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationText: {
    fontSize: 15,
    color: colors.foreground,
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  inputDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  destinationContainer: {
    paddingVertical: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  destinationInput: {
    flex: 1,
    fontSize: 15,
    color: colors.foreground,
    fontWeight: '500',
    padding: 0,
    marginTop: 4,
  },
  searchingIndicator: {
    marginLeft: 8,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    marginTop: 12,
  },
  searchButtonText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  suggestionsContainer: {
    marginBottom: 16,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionDetails: {
    flex: 1,
    marginLeft: 12,
  },
  suggestionMain: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.foreground,
  },
  suggestionSecondary: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  apiNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    marginBottom: 16,
  },
  apiNoticeText: {
    flex: 1,
    fontSize: 12,
    color: colors.mutedForeground,
    marginLeft: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginLeft: 8,
  },
  placeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  placeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeDetails: {
    flex: 1,
    marginLeft: 12,
  },
  placeName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.foreground,
  },
  placeAddress: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  mapSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginTop: 20,
    marginBottom: 20,
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
  },
  mapSelectText: {
    marginLeft: 8,
    fontSize: 15,
    fontWeight: '500',
    color: colors.primary,
  },
  poweredBy: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  poweredByText: {
    fontSize: 11,
    color: colors.mutedForeground,
  },
});
