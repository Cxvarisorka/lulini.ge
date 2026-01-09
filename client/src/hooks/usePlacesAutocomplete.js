import { useState, useEffect, useRef, useCallback } from 'react';

export function usePlacesAutocomplete(inputRef, options = {}) {
  const [predictions, setPredictions] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const autocompleteService = useRef(null);
  const placesService = useRef(null);
  const sessionToken = useRef(null);

  useEffect(() => {
    if (window.google && window.google.maps && window.google.maps.places) {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();
      sessionToken.current = new window.google.maps.places.AutocompleteSessionToken();
    }
  }, []);

  const getPlacePredictions = useCallback((input) => {
    if (!input || !autocompleteService.current) {
      setPredictions([]);
      return;
    }

    setIsLoading(true);

    autocompleteService.current.getPlacePredictions(
      {
        input,
        sessionToken: sessionToken.current,
        types: options.types || ['geocode', 'establishment'],
        componentRestrictions: options.componentRestrictions,
        ...options
      },
      (results, status) => {
        setIsLoading(false);
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
          setPredictions(results);
        } else {
          setPredictions([]);
        }
      }
    );
  }, [options]);

  const selectPlace = useCallback((placeId) => {
    if (!window.google || !window.google.maps) return;

    if (!placesService.current && inputRef.current) {
      placesService.current = new window.google.maps.places.PlacesService(
        document.createElement('div')
      );
    }

    if (placesService.current) {
      placesService.current.getDetails(
        {
          placeId,
          fields: ['formatted_address', 'geometry', 'name', 'place_id'],
          sessionToken: sessionToken.current
        },
        (place, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
            setSelectedPlace({
              address: place.formatted_address,
              name: place.name,
              placeId: place.place_id,
              lat: place.geometry?.location?.lat(),
              lng: place.geometry?.location?.lng()
            });
            setPredictions([]);
            sessionToken.current = new window.google.maps.places.AutocompleteSessionToken();
          }
        }
      );
    }
  }, [inputRef]);

  const clearSelection = useCallback(() => {
    setSelectedPlace(null);
    setPredictions([]);
  }, []);

  return {
    predictions,
    selectedPlace,
    isLoading,
    getPlacePredictions,
    selectPlace,
    clearSelection,
    setSelectedPlace
  };
}
