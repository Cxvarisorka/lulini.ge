import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, useTypography } from '../../theme/colors';
import { searchPlaces } from '../../services/googleMaps';

const MAX_STOPS = 2;

export default function LocationSearchSheet({
  pickup,
  destination,
  onDestinationChange,
  onDestinationSelect,
  onPickupRefresh,
  onPickupSelect,
  isLoadingLocation,
  userLocation,
  onSelectOnMap,
  stops = [],
  onAddStop,
  onRemoveStop,
  onStopSelect,
}) {
  const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState(destination || '');
  const [pickupQuery, setPickupQuery] = useState('');
  const [pickupEdited, setPickupEdited] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  // Track which input is active: 'pickup', 'destination', or stop index (0, 1)
  const [activeInput, setActiveInput] = useState('destination');
  const [stopQueries, setStopQueries] = useState({});
  const scrollViewRef = useRef(null);
  const inputRef = useRef(null);
  const stopInputRefs = useRef({});
  const searchIdRef = useRef(0);
  const pendingStopFocus = useRef(null);

  // Sync pickup address from GPS when not manually edited
  useEffect(() => {
    if (!pickupEdited && pickup?.address) {
      setPickupQuery(pickup.address);
    }
  }, [pickup?.address, pickupEdited]);

  // Auto-focus newly added stop input
  useEffect(() => {
    if (pendingStopFocus.current !== null) {
      const idx = pendingStopFocus.current;
      pendingStopFocus.current = null;
      // Small delay to let the TextInput mount
      setTimeout(() => {
        stopInputRefs.current[idx]?.focus();
      }, 100);
    }
  }, [stops.length]);

  // Get the active search query based on which input is focused
  const getActiveQuery = () => {
    if (activeInput === 'pickup') return pickupQuery;
    if (activeInput === 'destination') return searchQuery;
    return stopQueries[activeInput] || '';
  };
  const activeQuery = getActiveQuery();

  // Debounce search for active input (L13: request ID prevents out-of-order results)
  useEffect(() => {
    if (activeQuery.length < 3) {
      setSuggestions([]);
      return;
    }

    const currentSearchId = ++searchIdRef.current;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchPlaces(activeQuery, userLocation);
        // Only update if this is still the latest search
        if (currentSearchId === searchIdRef.current) {
          setSuggestions(results);
        }
      } catch (error) {
        if (currentSearchId === searchIdRef.current) {
          setSuggestions([]);
        }
      } finally {
        if (currentSearchId === searchIdRef.current) {
          setIsSearching(false);
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [activeQuery, userLocation]);

  // Handle pickup text change
  const handlePickupTextChange = useCallback((text) => {
    setPickupQuery(text);
    setPickupEdited(true);
    setActiveInput('pickup');
  }, []);

  // Handle destination text change
  const handleTextChange = useCallback((text) => {
    setSearchQuery(text);
    setActiveInput('destination');
  }, []);

  // Handle stop text change
  const handleStopTextChange = useCallback((index, text) => {
    setStopQueries(prev => ({ ...prev, [index]: text }));
    setActiveInput(index);
  }, []);

  // Determine the next input in sequence: pickup → stop0 → stop1 → destination
  const focusNextInput = useCallback((currentInput) => {
    if (currentInput === 'pickup') {
      if (stops.length > 0) {
        setActiveInput(0);
        setSuggestions([]);
        setTimeout(() => stopInputRefs.current[0]?.focus(), 100);
      } else {
        setActiveInput('destination');
        setSuggestions([]);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    } else if (typeof currentInput === 'number') {
      const nextStop = currentInput + 1;
      if (nextStop < stops.length) {
        setActiveInput(nextStop);
        setSuggestions([]);
        setTimeout(() => stopInputRefs.current[nextStop]?.focus(), 100);
      } else {
        setActiveInput('destination');
        setSuggestions([]);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
    // destination is the last input — no auto-advance
  }, [stops.length]);

  // Handle place selection from suggestions
  const handlePlaceSelect = useCallback((place) => {
    setSuggestions([]);

    if (activeInput === 'pickup') {
      setPickupQuery(place.description);
      setPickupEdited(true);
      if (onPickupSelect && place.coordinates) {
        onPickupSelect(place.description, place.coordinates);
      }
      focusNextInput('pickup');
    } else if (activeInput === 'destination') {
      setSearchQuery(place.description);
      Keyboard.dismiss();
      if (place.coordinates) {
        onDestinationSelect(place.description, place.coordinates);
      } else {
        onDestinationChange(place.description);
      }
      // Don't auto-advance — user stays on destination to review/submit
    } else {
      // Stop selection
      const stopIndex = activeInput;
      setStopQueries(prev => ({ ...prev, [stopIndex]: place.description }));
      if (onStopSelect) {
        onStopSelect(stopIndex, place.description, place.coordinates || null);
      }
      focusNextInput(stopIndex);
    }
  }, [activeInput, onPickupSelect, onDestinationSelect, onDestinationChange, onStopSelect, focusNextInput]);

  // Handle manual submit
  const handleSubmit = useCallback(() => {
    if (activeInput === 'destination' && searchQuery.length > 3) {
      Keyboard.dismiss();
      setSuggestions([]);
      onDestinationChange(searchQuery);
    }
  }, [activeInput, searchQuery, onDestinationChange]);

  // Handle removing a stop
  const handleRemoveStop = useCallback((index) => {
    setStopQueries(prev => {
      const updated = {};
      Object.keys(prev).forEach(key => {
        const k = parseInt(key);
        if (k < index) updated[k] = prev[k];
        else if (k > index) updated[k - 1] = prev[k];
      });
      return updated;
    });
    if (activeInput === index) {
      setActiveInput('destination');
    } else if (typeof activeInput === 'number' && activeInput > index) {
      setActiveInput(activeInput - 1);
    }
    setSuggestions([]);
    if (onRemoveStop) onRemoveStop(index);
  }, [activeInput, onRemoveStop]);

  // Reset pickup to GPS location
  const handlePickupReset = useCallback(() => {
    setPickupEdited(false);
    setPickupQuery(pickup?.address || '');
    setSuggestions([]);
    if (onPickupRefresh) onPickupRefresh();
  }, [pickup?.address, onPickupRefresh]);

  const recentPlaces = []; // TODO: Load from persisted user ride history

  const handleInputFocus = useCallback(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }, 100);
  }, []);

  const handlePickupFocus = useCallback(() => {
    setPickupQuery('');
    setPickupEdited(true);
    setActiveInput('pickup');
    setSuggestions([]);
    handleInputFocus();
  }, [handleInputFocus]);

  const handlePickupBlur = useCallback(() => {
    // If user left the field empty, restore the GPS address
    if (!pickupQuery.trim()) {
      setPickupQuery(pickup?.address || '');
      setPickupEdited(false);
    }
  }, [pickupQuery, pickup?.address]);

  const handleStopInputFocus = useCallback((index) => {
    setActiveInput(index);
    setSuggestions([]);
  }, []);

  const handleDestinationFocus = useCallback(() => {
    setActiveInput('destination');
    setSuggestions([]);
    handleInputFocus();
  }, [handleInputFocus]);

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
            <View style={styles.pulsingDotWrapper}>
              <View style={styles.pulsingRing} />
              <View style={[styles.dot, styles.purpleDot]} />
            </View>
            <View style={styles.dotLine} />
            {stops.map((_, index) => (
              <React.Fragment key={`stop-dot-${index}`}>
                <View style={[styles.dot, styles.purpleDot]} />
                <View style={styles.dotLine} />
              </React.Fragment>
            ))}
            <View style={[styles.dot, styles.purpleDot]} />
          </View>

          <View style={styles.inputsColumn}>
            {/* Pickup Location */}
            <View style={styles.pickupContainer}>
              <Text style={styles.locationLabel}>{t('taxi.pickup')}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.destinationInput}
                  placeholder={isLoadingLocation ? t('taxi.gettingLocation') : t('taxi.currentLocation')}
                  placeholderTextColor={colors.mutedForeground}
                  value={pickupQuery}
                  onChangeText={handlePickupTextChange}
                  onFocus={handlePickupFocus}
                  onBlur={handlePickupBlur}
                  autoCorrect={false}
                  autoCapitalize="words"
                  returnKeyType="next"
                  blurOnSubmit={true}
                />
                {activeInput === 'pickup' && isSearching && (
                  <ActivityIndicator size="small" color={colors.primary} style={styles.searchingIndicator} />
                )}
                <TouchableOpacity
                  onPress={handlePickupReset}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.refreshButton}
                >
                  <Ionicons name="locate" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Stop Inputs */}
            {stops.map((stop, index) => (
              <React.Fragment key={`stop-input-${index}`}>
                <View style={styles.inputDivider} />
                <View style={styles.stopContainer}>
                  <Text style={styles.locationLabel}>{t('taxi.stop')} {index + 1}</Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      ref={(ref) => { stopInputRefs.current[index] = ref; }}
                      style={styles.destinationInput}
                      placeholder={t('taxi.enterStopAddress')}
                      placeholderTextColor={colors.mutedForeground}
                      value={stopQueries[index] !== undefined ? stopQueries[index] : stop.address}
                      onChangeText={(text) => handleStopTextChange(index, text)}
                      onFocus={() => handleStopInputFocus(index)}
                      autoCorrect={false}
                      autoCapitalize="words"
                      returnKeyType="search"
                      blurOnSubmit={true}
                    />
                    {activeInput === index && isSearching && (
                      <ActivityIndicator size="small" color={colors.primary} style={styles.searchingIndicator} />
                    )}
                    <TouchableOpacity
                      style={styles.removeStopButton}
                      onPress={() => handleRemoveStop(index)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                </View>
              </React.Fragment>
            ))}

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
                  onFocus={handleDestinationFocus}
                  selectTextOnFocus={false}
                  autoCorrect={false}
                  autoCapitalize="words"
                  returnKeyType="search"
                  blurOnSubmit={true}
                  onSubmitEditing={handleSubmit}
                />
                {activeInput === 'destination' && isSearching && (
                  <ActivityIndicator size="small" color={colors.primary} style={styles.searchingIndicator} />
                )}
                {stops.length < MAX_STOPS && onAddStop && (
                  <TouchableOpacity
                    style={styles.addStopButton}
                    onPress={() => {
                      pendingStopFocus.current = stops.length;
                      onAddStop();
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="add-circle" size={20} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Search button (show when no suggestions and query is long enough) */}
              {activeInput === 'destination' && searchQuery.length > 3 && suggestions.length === 0 && !isSearching && (
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

      {/* Recent Places Section (show only when no suggestions and there are recent places) */}
      {suggestions.length === 0 && recentPlaces.length > 0 && (
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
        </>
      )}

      {/* Select on Map Option (show when no suggestions) */}
      {suggestions.length === 0 && (
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
      )}

      {/* OpenStreetMap attribution (required by Nominatim usage policy) */}
      {suggestions.length > 0 && (
        <View style={styles.poweredBy}>
          <Text style={styles.poweredByText}>
            {'Powered by OpenStreetMap'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (typography) => StyleSheet.create({
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
  purpleDot: {
    backgroundColor: colors.primary,
  },
  pulsingDotWrapper: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulsingRing: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    opacity: 0.3,
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
  pickupContainer: {
    paddingVertical: 12,
  },
  locationLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  refreshButton: {
    marginLeft: 8,
    padding: 8,
  },
  inputDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  destinationContainer: {
    paddingVertical: 12,
  },
  stopContainer: {
    paddingVertical: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  destinationInput: {
    flex: 1,
    ...typography.bodyMedium,
    color: colors.foreground,
    padding: 0,
    marginTop: 4,
  },
  searchingIndicator: {
    marginLeft: 8,
  },
  addStopButton: {
    marginLeft: 8,
    padding: 8,
  },
  removeStopButton: {
    marginLeft: 8,
    padding: 8,
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
    ...typography.button,
    color: colors.background,
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
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionDetails: {
    flex: 1,
    marginLeft: 12,
  },
  suggestionMain: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.foreground,
  },
  suggestionSecondary: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingTop: 8,
  },
  sectionTitle: {
    ...typography.caption,
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
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeDetails: {
    flex: 1,
    marginLeft: 12,
  },
  placeName: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.foreground,
  },
  placeAddress: {
    ...typography.caption,
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
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  mapSelectText: {
    marginLeft: 8,
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.primary,
  },
  poweredBy: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  poweredByText: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
  },
});
