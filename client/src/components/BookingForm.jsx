import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Calendar,
  Clock,
  Users,
  Briefcase,
  ArrowRight,
  Plane,
  ArrowLeftRight,
  LogIn
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { LocationInput } from './LocationInput';
import { VehicleSelector } from './VehicleSelector';
import { useAdmin } from '../context/AdminContext';
import { useUser } from '../context/UserContext';
import { cn } from '../lib/utils';

export function BookingForm({ onSubmit, onLocationsChange, routeInfo }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { transferPricing } = useAdmin();
  const { user, isLoggedIn, addUserTransferOrder } = useUser();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [tripType, setTripType] = useState('oneWay');
  const [formData, setFormData] = useState({
    pickup: null,
    dropoff: null,
    pickupAddress: '',
    dropoffAddress: '',
    date: '',
    time: '',
    returnDate: '',
    returnTime: '',
    passengers: 1,
    luggage: 1,
    vehicle: 'economy',
    flightNumber: '',
    name: '',
    email: '',
    phone: '',
    notes: ''
  });

  const [quote, setQuote] = useState(null);

  const updateFormData = (key, value) => {
    setFormData((prev) => {
      const newData = { ...prev, [key]: value };

      // Notify parent of location changes
      if (key === 'pickup' || key === 'dropoff') {
        const pickup = key === 'pickup' ? value : prev.pickup;
        const dropoff = key === 'dropoff' ? value : prev.dropoff;
        onLocationsChange?.(pickup, dropoff);
      }

      return newData;
    });
  };

  const calculateQuote = () => {
    if (!formData.pickup || !formData.dropoff) return null;

    // Use route info from Google Directions API if available
    let distance, duration;

    if (routeInfo) {
      distance = routeInfo.distance;
      duration = routeInfo.duration;
    } else {
      // Fallback: Calculate distance using Haversine formula
      const R = 6371; // Earth's radius in km
      const lat1 = formData.pickup.lat * (Math.PI / 180);
      const lat2 = formData.dropoff.lat * (Math.PI / 180);
      const deltaLat = (formData.dropoff.lat - formData.pickup.lat) * (Math.PI / 180);
      const deltaLng = (formData.dropoff.lng - formData.pickup.lng) * (Math.PI / 180);

      const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      distance = R * c;

      // Estimate duration (average speed ~60 km/h)
      duration = Math.round((distance / 60) * 60);
    }

    // Calculate price using admin-configured rates
    const basePrice = Math.max(
      transferPricing.minimumCharge,
      Math.round(distance * transferPricing.baseRatePerKm)
    );

    const vehicleMultiplier = transferPricing.vehicleMultipliers[formData.vehicle] || 1;
    const totalPrice = Math.round(basePrice * vehicleMultiplier);

    return {
      distance: Math.round(distance),
      distanceText: routeInfo?.distanceText || `${Math.round(distance)} km`,
      duration: Math.round(duration),
      durationText: routeInfo?.durationText || `~${Math.round(duration)} min`,
      basePrice,
      totalPrice
    };
  };

  const handleGetQuote = () => {
    const calculatedQuote = calculateQuote();
    setQuote(calculatedQuote);
    if (calculatedQuote) {
      setStep(2);
    }
  };

  const handleContinueToContact = () => {
    setStep(3);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Check if user is logged in
    if (!isLoggedIn) {
      setError('Please sign in to book a transfer');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Prepare order data for API
      const orderData = {
        tripType,
        pickup: {
          lat: formData.pickup.lat,
          lng: formData.pickup.lng,
          address: formData.pickupAddress
        },
        dropoff: {
          lat: formData.dropoff.lat,
          lng: formData.dropoff.lng,
          address: formData.dropoffAddress
        },
        pickupAddress: formData.pickupAddress,
        dropoffAddress: formData.dropoffAddress,
        date: formData.date,
        time: formData.time,
        returnDate: formData.returnDate || null,
        returnTime: formData.returnTime || null,
        passengers: formData.passengers,
        luggage: formData.luggage,
        vehicle: formData.vehicle,
        flightNumber: formData.flightNumber || null,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        notes: formData.notes || null,
        quote
      };

      // Save order via API (requires login)
      const newOrder = await addUserTransferOrder(orderData);

      // Call the original onSubmit callback with the created order
      onSubmit?.(newOrder);
    } catch (err) {
      setError(err.message || 'Failed to create booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStep1Valid =
    formData.pickup && formData.dropoff && formData.date && formData.time;

  const isStep2Valid = formData.vehicle;

  const isStep3Valid = formData.name && formData.email && formData.phone;

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto">
      {/* Progress Steps */}
      <div className="flex items-center justify-center mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                step >= s
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground"
              )}
            >
              {s}
            </div>
            {s < 3 && (
              <div
                className={cn(
                  "w-16 sm:w-24 h-0.5 mx-2",
                  step > s ? "bg-foreground" : "bg-secondary"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Route & Date */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Trip Type Toggle */}
          <div className="flex rounded-lg border border-border p-1 w-fit mx-auto">
            <button
              type="button"
              onClick={() => setTripType('oneWay')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                tripType === 'oneWay'
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t('booking.oneWay')}
            </button>
            <button
              type="button"
              onClick={() => setTripType('roundTrip')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                tripType === 'roundTrip'
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ArrowLeftRight className="w-4 h-4" />
              {t('booking.roundTrip')}
            </button>
          </div>

          {/* Locations */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('booking.pickupLocation')}</Label>
              <LocationInput
                placeholder={t('booking.pickupPlaceholder')}
                value={formData.pickupAddress}
                onChange={(value) => updateFormData('pickupAddress', value)}
                onPlaceSelect={(place) => updateFormData('pickup', place)}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('booking.dropoffLocation')}</Label>
              <LocationInput
                placeholder={t('booking.dropoffPlaceholder')}
                value={formData.dropoffAddress}
                onChange={(value) => updateFormData('dropoffAddress', value)}
                onPlaceSelect={(place) => updateFormData('dropoff', place)}
                icon={MapPin}
              />
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('booking.selectDate')}</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => updateFormData('date', e.target.value)}
                  className="pl-10 h-12"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('booking.selectTime')}</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="time"
                  value={formData.time}
                  onChange={(e) => updateFormData('time', e.target.value)}
                  className="pl-10 h-12"
                />
              </div>
            </div>
          </div>

          {/* Return Date & Time (for round trips) */}
          {tripType === 'roundTrip' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('booking.returnDate')}</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    type="date"
                    value={formData.returnDate}
                    onChange={(e) => updateFormData('returnDate', e.target.value)}
                    className="pl-10 h-12"
                    min={formData.date || new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('booking.returnTime')}</Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    type="time"
                    value={formData.returnTime}
                    onChange={(e) => updateFormData('returnTime', e.target.value)}
                    className="pl-10 h-12"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Passengers & Luggage */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('booking.passengers')}</Label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="number"
                  min="1"
                  max="16"
                  value={formData.passengers}
                  onChange={(e) => updateFormData('passengers', parseInt(e.target.value) || 1)}
                  className="pl-10 h-12"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('booking.luggage')}</Label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="number"
                  min="0"
                  max="20"
                  value={formData.luggage}
                  onChange={(e) => updateFormData('luggage', parseInt(e.target.value) || 0)}
                  className="pl-10 h-12"
                />
              </div>
            </div>
          </div>

          {/* Flight Number */}
          <div className="space-y-2">
            <Label>{t('booking.flightNumber')}</Label>
            <div className="relative">
              <Plane className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="e.g. AA1234"
                value={formData.flightNumber}
                onChange={(e) => updateFormData('flightNumber', e.target.value)}
                className="pl-10 h-12"
              />
            </div>
          </div>

          <Button
            type="button"
            onClick={handleGetQuote}
            disabled={!isStep1Valid}
            className="w-full h-14 text-lg"
            size="xl"
          >
            {t('booking.getQuote')}
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      )}

      {/* Step 2: Vehicle Selection */}
      {step === 2 && (
        <div className="space-y-6">
          {/* Quote Summary */}
          {quote && (
            <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('quote.distance')}</span>
                <span className="font-medium">{quote.distanceText}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('quote.duration')}</span>
                <span className="font-medium">{quote.durationText}</span>
              </div>
            </div>
          )}

          <VehicleSelector
            selected={formData.vehicle}
            onSelect={(vehicle) => updateFormData('vehicle', vehicle)}
            basePrice={quote?.basePrice || 0}
          />

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(1)}
              className="flex-1 h-12"
            >
              {t('common.back')}
            </Button>
            <Button
              type="button"
              onClick={handleContinueToContact}
              disabled={!isStep2Valid}
              className="flex-1 h-12"
            >
              {t('common.continue')}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Contact Information */}
      {step === 3 && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold">{t('contact.title')}</h3>

          {/* Login Required Notice */}
          {!isLoggedIn && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <LogIn className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    {t('booking.loginRequired', 'Sign in required to book')}
                  </p>
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    {t('booking.loginRequiredDesc', 'Please sign in to complete your booking')}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/signin')}
                  className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900"
                >
                  {t('booking.signInButton', 'Sign In')}
                </Button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('contact.name')}</Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => updateFormData('name', e.target.value)}
                className="h-12"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t('contact.email')}</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => updateFormData('email', e.target.value)}
                className="h-12"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t('contact.phone')}</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => updateFormData('phone', e.target.value)}
                className="h-12"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{t('contact.notes')}</Label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => updateFormData('notes', e.target.value)}
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={t('booking.specialRequests')}
              />
            </div>
          </div>

          {/* Final Quote */}
          {quote && (
            <div className="bg-foreground text-background rounded-lg p-6 space-y-4">
              <h4 className="font-semibold text-lg">{t('quote.title')}</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm opacity-80">
                  <span>{t('quote.distance')}</span>
                  <span>{quote.distanceText}</span>
                </div>
                <div className="flex justify-between text-sm opacity-80">
                  <span>{t('quote.duration')}</span>
                  <span>{quote.durationText}</span>
                </div>
                <div className="border-t border-background/20 pt-2 mt-2">
                  <div className="flex justify-between text-xl font-bold">
                    <span>{t('quote.total')}</span>
                    <span>
                      $
                      {Math.round(
                        quote.basePrice *
                          (transferPricing.vehicleMultipliers[formData.vehicle] || 1)
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-sm opacity-80 space-y-1">
                <p className="font-medium">{t('quote.included')}:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>{t('quote.meetGreet')}</li>
                  <li>{t('quote.flightTracking')}</li>
                  <li>{t('quote.freeWaiting')}</li>
                  <li>{t('quote.freeCancellation')}</li>
                </ul>
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(2)}
              className="flex-1 h-12"
              disabled={isSubmitting}
            >
              {t('common.back')}
            </Button>
            <Button
              type="submit"
              disabled={!isStep3Valid || !isLoggedIn || isSubmitting}
              className="flex-1 h-14 text-lg"
              size="xl"
            >
              {isSubmitting ? t('booking.booking', 'Booking...') : t('booking.bookNow')}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
