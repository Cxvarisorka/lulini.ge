import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, User, Phone, Car, FileText, DollarSign, Loader2, CheckCircle, Plus, X, Clock, Route } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { rideService } from '../../services/ride';
import { settingsService } from '../../services/settings';
import { RouteMap } from '../../components/RouteMap';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const vehicleTypes = [
  { value: 'economy', label: 'Economy', multiplier: 1 },
  { value: 'comfort', label: 'Comfort', multiplier: 1.5 },
  { value: 'business', label: 'Business', multiplier: 2 },
  { value: 'van', label: 'Van', multiplier: 1.5 },
  { value: 'minibus', label: 'Minibus', multiplier: 2 },
];

// Kutaisi area config
const KUTAISI_CENTER = { lat: 42.2679, lng: 42.6946 };
const KUTAISI_VIEWPORT = {
  southwest: { lat: 42.05, lng: 42.35 },
  northeast: { lat: 42.5, lng: 43.0 },
};

// Primary: OSM Nominatim search (same as mobile app)
async function searchNominatim(query) {
  if (!query || query.length < 2) return [];
  try {
    const viewbox = `${KUTAISI_VIEWPORT.southwest.lng},${KUTAISI_VIEWPORT.southwest.lat},${KUTAISI_VIEWPORT.northeast.lng},${KUTAISI_VIEWPORT.northeast.lat}`;
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      countrycodes: 'ge',
      viewbox,
      bounded: '0',
      limit: '8',
      dedupe: '1',
      'accept-language': 'ka,en',
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'LuliniAdmin/1.0' },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.map((item) => {
      const addr = item.address || {};
      let mainText = '';
      if (addr.road) {
        mainText = addr.house_number ? `${addr.road} ${addr.house_number}` : addr.road;
      } else if (item.name && item.name !== item.display_name) {
        mainText = item.name;
      } else {
        mainText = item.display_name.split(',')[0].trim();
      }
      const secondaryParts = [
        addr.suburb || addr.neighbourhood || addr.district,
        addr.city || addr.town || addr.village,
        addr.state,
      ].filter(Boolean);
      return {
        id: `nominatim:${item.place_id}`,
        mainText,
        secondaryText: secondaryParts.length > 0 ? secondaryParts.join(', ') : item.display_name.split(',').slice(1, 3).join(',').trim(),
        address: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        source: 'nominatim',
      };
    });
  } catch {
    return [];
  }
}

// Primary: Google Places Autocomplete biased to Kutaisi
function searchGooglePlaces(query) {
  return new Promise((resolve) => {
    if (!window.google?.maps?.places || !query || query.length < 2) {
      resolve([]);
      return;
    }
    const service = new window.google.maps.places.AutocompleteService();
    service.getPlacePredictions(
      {
        input: query,
        types: ['geocode', 'establishment'],
        componentRestrictions: { country: 'ge' },
        location: new window.google.maps.LatLng(KUTAISI_CENTER.lat, KUTAISI_CENTER.lng),
        radius: 30000,
      },
      (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
          resolve(results.map((p) => ({
            id: p.place_id,
            mainText: p.structured_formatting?.main_text || p.description,
            secondaryText: p.structured_formatting?.secondary_text || '',
            address: p.description,
            lat: null,
            lng: null,
            source: 'google',
            placeId: p.place_id,
          })));
        } else {
          resolve([]);
        }
      }
    );
  });
}

// Resolve Google Place ID to coordinates
function resolveGooglePlaceCoords(placeId) {
  return new Promise((resolve) => {
    if (!window.google?.maps?.places) { resolve(null); return; }
    const service = new window.google.maps.places.PlacesService(document.createElement('div'));
    service.getDetails(
      { placeId, fields: ['formatted_address', 'geometry'] },
      (result, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && result) {
          resolve({
            address: result.formatted_address,
            lat: result.geometry?.location?.lat(),
            lng: result.geometry?.location?.lng(),
          });
        } else {
          resolve(null);
        }
      }
    );
  });
}

function loadGoogleMapsScript() {
  return new Promise((resolve) => {
    if (window.google?.maps?.places) { resolve(); return; }
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) { existing.addEventListener('load', resolve); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

function PlaceInput({ label, icon: Icon, iconColor, place, onPlaceSelect, onClear, placeholder }) {
  const inputRef = useRef(null);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchIdRef = useRef(0);

  useEffect(() => {
    if (place) {
      setInputValue(place.address);
    } else {
      setInputValue('');
    }
  }, [place]);

  // Debounced search: Google first, Nominatim fallback
  useEffect(() => {
    if (inputValue.length < 2 || place) {
      setSuggestions([]);
      return;
    }

    const currentId = ++searchIdRef.current;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Primary: Google Places Autocomplete (biased to Kutaisi)
        let results = await searchGooglePlaces(inputValue);

        // Fallback: Nominatim if Google returned nothing
        if (results.length === 0) {
          results = await searchNominatim(inputValue);
        }

        if (currentId === searchIdRef.current) {
          setSuggestions(results);
          setShowDropdown(results.length > 0);
        }
      } catch {
        if (currentId === searchIdRef.current) {
          setSuggestions([]);
          setShowDropdown(false);
        }
      } finally {
        if (currentId === searchIdRef.current) {
          setIsSearching(false);
        }
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [inputValue, place]);

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const handleSelect = useCallback(async (suggestion) => {
    setSuggestions([]);
    setShowDropdown(false);

    if (suggestion.source === 'nominatim') {
      const selected = { address: suggestion.address, lat: suggestion.lat, lng: suggestion.lng };
      setInputValue(selected.address);
      onPlaceSelect(selected);
    } else if (suggestion.source === 'google' && suggestion.placeId) {
      // Need to resolve coordinates from Google Place ID
      const resolved = await resolveGooglePlaceCoords(suggestion.placeId);
      if (resolved) {
        setInputValue(resolved.address);
        onPlaceSelect(resolved);
      }
    }
  }, [onPlaceSelect]);

  const handleClear = () => {
    setInputValue('');
    setSuggestions([]);
    setShowDropdown(false);
    onClear();
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        {label}
      </Label>
      <div className="relative">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder={placeholder}
          className={place ? 'pr-8 border-green-300 bg-green-50/50' : ''}
        />
        {isSearching && !place && (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {place && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(suggestion)}
              >
                <p className="font-medium">{suggestion.mainText}</p>
                <p className="text-xs text-muted-foreground">{suggestion.secondaryText}</p>
              </button>
            ))}
            <div className="px-3 py-1 text-[10px] text-muted-foreground/60 border-t">
              {suggestions[0]?.source === 'nominatim' ? 'Powered by OpenStreetMap' : 'Powered by Google'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminCreateRide() {
  const navigate = useNavigate();
  const [mapsLoaded, setMapsLoaded] = useState(!!window.google?.maps?.places);
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('economy');
  const [price, setPrice] = useState('');
  const [priceOverridden, setPriceOverridden] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!mapsLoaded && GOOGLE_MAPS_API_KEY) {
      loadGoogleMapsScript().then(() => setMapsLoaded(true));
    }
  }, [mapsLoaded]);

  // Fetch pricing settings on mount
  useEffect(() => {
    settingsService.getPricing().then((res) => {
      if (res?.data) {
        setPricing(res.data);
      }
    }).catch((err) => console.error('Failed to fetch pricing:', err));
  }, []);

  const calculateAutoPrice = useCallback((route, pricingData, vType) => {
    if (!route || !pricingData?.categories) return null;
    const cat = pricingData.categories[vType] || pricingData.categories.economy;
    const fare = cat.basePrice + (route.distance * cat.kmPrice);
    return (Math.round(fare * 100) / 100).toString();
  }, []);

  // Auto-calculate price when route info, pricing, or vehicle type changes (unless manually overridden)
  useEffect(() => {
    if (!priceOverridden) {
      const auto = calculateAutoPrice(routeInfo, pricing, vehicleType);
      if (auto) setPrice(auto);
    }
  }, [routeInfo, pricing, vehicleType, priceOverridden, calculateAutoPrice]);

  const handleRouteCalculated = useCallback((info) => {
    setRouteInfo(info);
  }, []);

  const handlePriceChange = (e) => {
    const val = e.target.value;
    // Allow empty, digits, and one decimal point
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      setPrice(val);
      setPriceOverridden(true);
    }
  };

  const resetToAutoPrice = () => {
    setPriceOverridden(false);
    const auto = calculateAutoPrice(routeInfo, pricing, vehicleType);
    if (auto) setPrice(auto);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!pickup) return setError('Please select a pickup location');
    if (!dropoff) return setError('Please select a dropoff location');
    if (!passengerName.trim()) return setError('Passenger name is required');
    if (!price || parseFloat(price) <= 0) return setError('Please enter a valid price');

    setSubmitting(true);
    try {
      await rideService.adminCreate({
        pickup,
        dropoff,
        vehicleType,
        passengerName: passengerName.trim(),
        passengerPhone: passengerPhone.trim(),
        price: parseFloat(price),
        routeInfo: routeInfo || undefined,
        notes: notes.trim() || undefined,
      });

      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to create ride');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAnother = () => {
    setPickup(null);
    setDropoff(null);
    setRouteInfo(null);
    setPassengerName('');
    setPassengerPhone('');
    setVehicleType('economy');
    setPrice('');
    setPriceOverridden(false);
    setNotes('');
    setSuccess(false);
    setError('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Ride</h1>
        <p className="text-muted-foreground mt-1">
          Create a ride request on behalf of a caller
        </p>
      </div>

      {success ? (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold">Ride Created Successfully!</h2>
            <p className="text-muted-foreground">
              The ride request has been sent to nearby drivers.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={handleCreateAnother}>
                <Plus className="h-4 w-4 mr-2" />
                Create Another
              </Button>
              <Button variant="outline" onClick={() => navigate('/admin/rides')}>
                View All Rides
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Form */}
            <div className="space-y-6">
              {/* Location Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MapPin className="h-5 w-5" />
                    Route
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!mapsLoaded ? (
                    <div className="flex items-center gap-2 text-muted-foreground py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading maps...
                    </div>
                  ) : (
                    <>
                      <PlaceInput
                        label="Pickup"
                        icon={MapPin}
                        iconColor="text-green-600"
                        place={pickup}
                        onPlaceSelect={setPickup}
                        onClear={() => { setPickup(null); setRouteInfo(null); }}
                        placeholder="Enter pickup address"
                      />
                      <PlaceInput
                        label="Dropoff"
                        icon={MapPin}
                        iconColor="text-red-600"
                        place={dropoff}
                        onPlaceSelect={setDropoff}
                        onClear={() => { setDropoff(null); setRouteInfo(null); }}
                        placeholder="Enter dropoff address"
                      />
                    </>
                  )}

                  {/* Route Info Summary */}
                  {routeInfo && (
                    <div className="flex gap-4 pt-2 border-t text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Route className="h-4 w-4" />
                        <span className="font-medium text-foreground">{routeInfo.distanceText}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span className="font-medium text-foreground">{routeInfo.durationText}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <DollarSign className="h-4 w-4" />
                        <span className="font-medium text-foreground">{parseFloat(price || 0).toFixed(2)} GEL</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Passenger Info Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <User className="h-5 w-5" />
                    Passenger
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      Name *
                    </Label>
                    <Input
                      value={passengerName}
                      onChange={(e) => setPassengerName(e.target.value)}
                      placeholder="Passenger name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      Phone
                    </Label>
                    <Input
                      value={passengerPhone}
                      onChange={(e) => setPassengerPhone(e.target.value)}
                      placeholder="+995 ..."
                      type="tel"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Ride Details Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Car className="h-5 w-5" />
                    Ride Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Vehicle Type</Label>
                    <Select value={vehicleType} onValueChange={setVehicleType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicleTypes.map((vt) => (
                          <SelectItem key={vt.value} value={vt.value}>
                            {vt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      Price (GEL)
                      {routeInfo && !priceOverridden && (
                        <span className="text-xs text-green-600 font-normal">(auto-calculated)</span>
                      )}
                      {priceOverridden && (
                        <button
                          type="button"
                          onClick={resetToAutoPrice}
                          className="text-xs text-blue-600 hover:underline font-normal"
                        >
                          Reset to auto
                        </button>
                      )}
                    </Label>
                    <Input
                      value={price}
                      onChange={handlePriceChange}
                      placeholder={routeInfo ? 'Auto-calculated' : 'Set pickup & dropoff first'}
                      type="text"
                      inputMode="decimal"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Notes
                    </Label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any additional notes for the driver..."
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
                      maxLength={500}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                  {error}
                </div>
              )}

              {/* Submit */}
              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Ride...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Ride Request
                  </>
                )}
              </Button>
            </div>

            {/* Right Column - Map */}
            <div className="lg:sticky lg:top-8 lg:self-start">
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="h-[500px] lg:h-[calc(100vh-8rem)]">
                    {mapsLoaded ? (
                      <RouteMap
                        pickup={pickup}
                        dropoff={dropoff}
                        onRouteCalculated={handleRouteCalculated}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center bg-secondary/50">
                        <div className="text-center text-muted-foreground">
                          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                          <p className="text-sm">Loading map...</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
