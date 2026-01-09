import { useState, useRef, useEffect } from 'react';
import { MapPin, X, Loader2 } from 'lucide-react';
import { Input } from './ui/input';
import { cn } from '../lib/utils';
import { usePlacesAutocomplete } from '../hooks/usePlacesAutocomplete';

export function LocationInput({
  placeholder,
  value,
  onChange,
  onPlaceSelect,
  icon: Icon = MapPin,
  className
}) {
  const [inputValue, setInputValue] = useState(value || '');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  const {
    predictions,
    isLoading,
    getPlacePredictions,
    selectPlace,
    setSelectedPlace
  } = usePlacesAutocomplete(inputRef);

  useEffect(() => {
    if (value !== inputValue) {
      setInputValue(value || '');
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange?.(newValue);
    getPlacePredictions(newValue);
  };

  const handleSelectPrediction = (prediction) => {
    setInputValue(prediction.description);
    onChange?.(prediction.description);
    selectPlace(prediction.place_id);

    // Get place details for coordinates
    if (window.google && window.google.maps) {
      const placesService = new window.google.maps.places.PlacesService(
        document.createElement('div')
      );

      placesService.getDetails(
        {
          placeId: prediction.place_id,
          fields: ['formatted_address', 'geometry', 'name', 'place_id']
        },
        (place, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
            onPlaceSelect?.({
              address: place.formatted_address,
              name: place.name,
              placeId: place.place_id,
              lat: place.geometry?.location?.lat(),
              lng: place.geometry?.location?.lng()
            });
          }
        }
      );
    }
    setIsFocused(false);
  };

  const handleClear = () => {
    setInputValue('');
    onChange?.('');
    setSelectedPlace(null);
    onPlaceSelect?.(null);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          className="pl-10 pr-10 h-12 text-base"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {inputValue && !isLoading && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isFocused && predictions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-border rounded-lg shadow-lg overflow-hidden">
          {predictions.map((prediction) => (
            <button
              key={prediction.place_id}
              type="button"
              onClick={() => handleSelectPrediction(prediction)}
              className="w-full px-4 py-3 text-left hover:bg-secondary transition-colors flex items-start gap-3"
            >
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">
                  {prediction.structured_formatting?.main_text || prediction.description}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {prediction.structured_formatting?.secondary_text || ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
