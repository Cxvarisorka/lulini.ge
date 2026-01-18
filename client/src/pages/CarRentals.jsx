import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, Briefcase, Fuel, Settings2, DoorOpen, Search, MapPin, X } from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { categories } from '../data/rentalCars';
import { useAdmin } from '../context/AdminContext';

export function CarRentals() {
  const { t } = useTranslation();
  const { cars: rentalCars, cityLocations } = useAdmin();
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeLocation, setActiveLocation] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const getLocationById = (id) => {
    return cityLocations.find(loc => loc.id === id);
  };

  const filteredCars = useMemo(() => {
    let cars = rentalCars;

    // Filter by category
    if (activeCategory !== 'all') {
      cars = cars.filter(car => car.category === activeCategory);
    }

    // Filter by location
    if (activeLocation !== 'all') {
      cars = cars.filter(car => car.locationId === activeLocation);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      cars = cars.filter(car =>
        car.brand.toLowerCase().includes(query) ||
        car.model.toLowerCase().includes(query) ||
        car.category.toLowerCase().includes(query) ||
        car.features.some(f => f.toLowerCase().includes(query))
      );
    }

    return cars;
  }, [activeCategory, activeLocation, searchQuery, rentalCars]);

  const clearFilters = () => {
    setActiveCategory('all');
    setActiveLocation('all');
    setSearchQuery('');
  };

  const hasActiveFilters = activeCategory !== 'all' || activeLocation !== 'all' || searchQuery.trim();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero Section with Search */}
      <section className="pt-24 pb-8 md:pt-32 md:pb-12 bg-gradient-to-b from-secondary/50 to-background">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
              {t('carRentals.title')}
            </h1>
            <p className="text-lg text-muted-foreground">
              {t('carRentals.subtitle')}
            </p>
          </div>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('carRentals.searchPlaceholder')}
                className="w-full pl-12 pr-12 py-4 rounded-xl border border-border bg-white text-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* City Locations */}
      <section className="py-6 bg-secondary/30">
        <div className="container mx-auto px-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            {t('carRentals.pickupLocations')}
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveLocation('all')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                activeLocation === 'all'
                  ? "bg-foreground text-background"
                  : "bg-white text-foreground hover:bg-white/80 border border-border"
              )}
            >
              {t('carRentals.allLocations')}
              <span className="text-xs opacity-70">({rentalCars.length})</span>
            </button>
            {cityLocations.map((location) => {
              const carCount = rentalCars.filter(car => car.locationId === location.id).length;
              return (
                <button
                  key={location.id}
                  onClick={() => setActiveLocation(location.id)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                    activeLocation === location.id
                      ? "bg-foreground text-background"
                      : "bg-white text-foreground hover:bg-white/80 border border-border"
                  )}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {location.name}
                  <span className="text-xs opacity-70">({carCount})</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Category Filter */}
      <section className="py-4 border-b border-border sticky top-16 bg-white/95 backdrop-blur-sm z-40">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium transition-all",
                    activeCategory === category.id
                      ? "bg-foreground text-background"
                      : "bg-secondary text-foreground hover:bg-secondary/80"
                  )}
                >
                  {t(`carRentals.categories.${category.id}`)}
                </button>
              ))}
            </div>

            {/* Results count & Clear filters */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {filteredCars.length} {t('carRentals.carsFound')}
              </span>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-foreground underline hover:no-underline"
                >
                  {t('carRentals.clearFilters')}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Cars Grid */}
      <section className="py-12 flex-1">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCars.map((car) => {
              const location = getLocationById(car.locationId);
              const carId = car._id || car.id;
              return (
                <Link
                  key={carId}
                  to={`/car-rentals/${carId}`}
                  className="group bg-white rounded-xl border border-border overflow-hidden hover:shadow-xl transition-all duration-300"
                >
                  {/* Car Image */}
                  <div className="relative h-48 bg-secondary overflow-hidden">
                    <img
                      src={car.image}
                      alt={`${car.brand} ${car.model}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        e.target.src = 'https://cdn-icons-png.flaticon.com/512/55/55283.png';
                        e.target.className = 'w-full h-full object-contain p-8';
                      }}
                    />
                    {/* Category Badge */}
                    <span className="absolute top-3 left-3 px-3 py-1 bg-foreground/90 text-background text-xs font-medium rounded-full">
                      {t(`carRentals.categories.${car.category}`)}
                    </span>
                    {/* Location Badge */}
                    {location && (
                      <span className="absolute top-3 right-3 px-2 py-1 bg-white/90 text-foreground text-xs font-medium rounded-full flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {location.name}
                      </span>
                    )}
                    {!car.available && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="text-white font-semibold">{t('carRentals.unavailable')}</span>
                      </div>
                    )}
                  </div>

                  {/* Car Info */}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <h3 className="text-xl font-semibold group-hover:text-foreground/80 transition-colors">
                          {car.brand} {car.model}
                        </h3>
                        <p className="text-sm text-muted-foreground">{car.year}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">${car.pricePerDay}</p>
                        <p className="text-xs text-muted-foreground">{t('carRentals.perDay')}</p>
                      </div>
                    </div>

                    {/* Specs */}
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-4">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>{car.passengers}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Briefcase className="w-4 h-4" />
                        <span>{car.luggage}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <DoorOpen className="w-4 h-4" />
                        <span>{car.doors}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Settings2 className="w-4 h-4" />
                        <span className="capitalize">{t(`carRentals.transmission.${car.transmission}`)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Fuel className="w-4 h-4" />
                        <span className="capitalize">{t(`carRentals.fuel.${car.fuelType}`)}</span>
                      </div>
                    </div>

                    {/* Features Preview */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {car.features.slice(0, 3).map((feature, index) => (
                        <span
                          key={index}
                          className="text-xs px-2 py-1 bg-secondary rounded-full"
                        >
                          {feature}
                        </span>
                      ))}
                      {car.features.length > 3 && (
                        <span className="text-xs px-2 py-1 bg-secondary rounded-full text-muted-foreground">
                          +{car.features.length - 3}
                        </span>
                      )}
                    </div>

                    {/* CTA */}
                    <Button className="w-full group-hover:bg-foreground/90" disabled={!car.available}>
                      {t('carRentals.viewDetails')}
                    </Button>
                  </div>
                </Link>
              );
            })}
          </div>

          {filteredCars.length === 0 && (
            <div className="text-center py-16">
              <p className="text-muted-foreground mb-4">{t('carRentals.noCars')}</p>
              {hasActiveFilters && (
                <Button variant="outline" onClick={clearFilters}>
                  {t('carRentals.clearFilters')}
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
