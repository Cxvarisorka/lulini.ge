import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { BookingForm } from '../components/BookingForm';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { RouteMap } from '../components/RouteMap';
import { CalendarCheck, MapPin, Car, CheckCircle, Clock, CreditCard, Plane, Users, Briefcase, Wifi, Droplets, Shield } from 'lucide-react';

export function Transfers() {
  const { t } = useTranslation();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [bookingData, setBookingData] = useState(null);
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);

  const handleBookingSubmit = (data) => {
    console.log('Booking submitted:', data);
    setBookingData(data);
    setShowConfirmation(true);
  };

  const handleCloseConfirmation = () => {
    setShowConfirmation(false);
    setBookingData(null);
    window.location.reload();
  };

  const handleLocationsChange = useCallback((pickupLocation, dropoffLocation) => {
    setPickup(pickupLocation);
    setDropoff(dropoffLocation);
  }, []);

  const handleRouteCalculated = useCallback((info) => {
    setRouteInfo(info);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero Section */}
      <section className="pt-24 pb-6 md:pt-32 md:pb-8 bg-gradient-to-b from-secondary/50 to-background">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
              {t('transfers.hero.title')}
            </h1>
            <p className="text-lg text-muted-foreground">
              {t('transfers.hero.subtitle')}
            </p>
          </div>
        </div>
      </section>

      {/* Booking Form Section with Map */}
      <section className="py-8 -mt-4" id="booking">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Form */}
            <div className="bg-white rounded-2xl shadow-xl border border-border p-6 md:p-8">
              <BookingForm
                onSubmit={handleBookingSubmit}
                onLocationsChange={handleLocationsChange}
                routeInfo={routeInfo}
              />
            </div>

            {/* Map */}
            <div className="bg-white rounded-2xl shadow-xl border border-border p-4 lg:sticky lg:top-24">
              <div className="h-[400px] lg:h-[600px]">
                <RouteMap
                  pickup={pickup}
                  dropoff={dropoff}
                  onRouteCalculated={handleRouteCalculated}
                />
              </div>

              {/* Route Info Display */}
              {routeInfo && (
                <div className="mt-4 p-4 bg-secondary/50 rounded-lg">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('quote.distance')}</p>
                      <p className="text-xl font-bold">{routeInfo.distanceText}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t('quote.duration')}</p>
                      <p className="text-xl font-bold">{routeInfo.durationText}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">
            {t('transfers.howItWorks.title')}
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            {t('transfers.howItWorks.subtitle')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { icon: CalendarCheck, key: 'book', step: 1 },
              { icon: CheckCircle, key: 'confirm', step: 2 },
              { icon: MapPin, key: 'pickup', step: 3 },
              { icon: Car, key: 'ride', step: 4 }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.key} className="text-center relative">
                  <div className="w-16 h-16 bg-foreground text-background rounded-full flex items-center justify-center mx-auto mb-4 relative">
                    <Icon className="w-8 h-8" />
                    <span className="absolute -top-2 -right-2 w-6 h-6 bg-white border-2 border-foreground rounded-full text-xs font-bold flex items-center justify-center">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="font-semibold mb-2">
                    {t(`transfers.howItWorks.steps.${item.key}.title`)}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t(`transfers.howItWorks.steps.${item.key}.description`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Vehicle Fleet Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">
            {t('transfers.fleet.title')}
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            {t('transfers.fleet.subtitle')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { id: 'economy', image: 'https://cdn-icons-png.flaticon.com/512/55/55283.png', passengers: 3, luggage: 2 },
              { id: 'business', image: 'https://cdn-icons-png.flaticon.com/512/55/55280.png', passengers: 3, luggage: 3 },
              { id: 'firstClass', image: 'https://cdn-icons-png.flaticon.com/512/55/55274.png', passengers: 3, luggage: 3 }
            ].map((vehicle) => (
              <div
                key={vehicle.id}
                className="bg-white rounded-xl border border-border overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="h-48 bg-secondary flex items-center justify-center p-6">
                  <img
                    src={vehicle.image}
                    alt={t(`vehicles.${vehicle.id}.name`)}
                    className="w-32 h-32 object-contain"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-semibold mb-2">
                    {t(`vehicles.${vehicle.id}.name`)}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t(`vehicles.${vehicle.id}.description`)}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {vehicle.passengers}
                    </span>
                    <span className="flex items-center gap-1">
                      <Briefcase className="w-4 h-4" />
                      {vehicle.luggage}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What's Included Section */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">
            {t('transfers.included.title')}
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            {t('transfers.included.subtitle')}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {[
              { icon: Plane, key: 'flightTracking' },
              { icon: Clock, key: 'freeWaiting' },
              { icon: Users, key: 'meetGreet' },
              { icon: Wifi, key: 'wifi' },
              { icon: Droplets, key: 'water' },
              { icon: CreditCard, key: 'noHidden' }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.key} className="text-center p-4">
                  <div className="w-12 h-12 bg-white border border-border rounded-full flex items-center justify-center mx-auto mb-3">
                    <Icon className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-medium">
                    {t(`transfers.included.items.${item.key}`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Popular Routes Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">
            {t('transfers.routes.title')}
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            {t('transfers.routes.subtitle')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
            {[
              { key: 'airportTbilisi', from: 'Tbilisi Airport', to: 'Tbilisi Center', price: 25, duration: '25 min' },
              { key: 'tbilisiBatumi', from: 'Tbilisi', to: 'Batumi', price: 150, duration: '5 hrs' },
              { key: 'tbilisiKazbegi', from: 'Tbilisi', to: 'Kazbegi', price: 80, duration: '3 hrs' },
              { key: 'tbilisiKakheti', from: 'Tbilisi', to: 'Kakheti', price: 70, duration: '1.5 hrs' },
              { key: 'airportBatumi', from: 'Batumi Airport', to: 'Batumi Center', price: 15, duration: '15 min' },
              { key: 'tbilisiGudauri', from: 'Tbilisi', to: 'Gudauri', price: 60, duration: '2 hrs' }
            ].map((route) => (
              <div
                key={route.key}
                className="flex items-center justify-between p-4 bg-white rounded-lg border border-border hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center">
                    <Car className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium">{route.from} → {route.to}</p>
                    <p className="text-sm text-muted-foreground">{route.duration}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">${route.price}</p>
                  <p className="text-xs text-muted-foreground">{t('transfers.routes.from')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Badges Section */}
      <section className="py-12 bg-foreground text-background">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16">
            <div className="text-center">
              <p className="text-3xl font-bold">5000+</p>
              <p className="text-sm opacity-80">{t('transfers.stats.transfers')}</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">4.9</p>
              <p className="text-sm opacity-80">{t('transfers.stats.rating')}</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">50+</p>
              <p className="text-sm opacity-80">{t('transfers.stats.drivers')}</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">24/7</p>
              <p className="text-sm opacity-80">{t('transfers.stats.support')}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="flex-1" />

      <Footer />

      <ConfirmationDialog
        isOpen={showConfirmation}
        onClose={handleCloseConfirmation}
        bookingData={bookingData}
      />
    </div>
  );
}
