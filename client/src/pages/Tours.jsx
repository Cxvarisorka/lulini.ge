import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, Users, MapPin, Search, X, Star } from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { tourService } from '../services/tour';

const tourCategories = [
  { id: 'all', label: 'All Tours' },
  { id: 'cultural', label: 'Cultural' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'nature', label: 'Nature' },
  { id: 'wine', label: 'Wine Tours' },
  { id: 'food', label: 'Food Tours' },
  { id: 'historical', label: 'Historical' },
  { id: 'mountain', label: 'Mountain' },
  { id: 'city', label: 'City Tours' }
];

export function Tours() {
  const { t } = useTranslation();
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchTours();
  }, []);

  const fetchTours = async () => {
    try {
      setLoading(true);
      const response = await tourService.getAllTours();
      setTours(response.data.tours || []);
    } catch (error) {
      console.error('Error fetching tours:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTours = useMemo(() => {
    let filtered = tours;

    // Filter by category
    if (activeCategory !== 'all') {
      filtered = filtered.filter(tour => tour.category === activeCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(tour =>
        tour.name.toLowerCase().includes(query) ||
        tour.description.toLowerCase().includes(query) ||
        tour.location.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [activeCategory, searchQuery, tours]);

  const clearFilters = () => {
    setActiveCategory('all');
    setSearchQuery('');
  };

  const hasActiveFilters = activeCategory !== 'all' || searchQuery.trim();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero Section with Search */}
      <section className="pt-24 pb-8 md:pt-32 md:pb-12 bg-gradient-to-b from-secondary/50 to-background">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
              {t('tours.title')}
            </h1>
            <p className="text-lg text-muted-foreground">
              {t('tours.subtitle')}
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
                placeholder={t('tours.searchPlaceholder')}
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

      {/* Category Filter */}
      <section className="py-4 border-b border-border sticky top-16 bg-white/95 backdrop-blur-sm z-40">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {tourCategories.map((category) => (
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
                  {t(`tours.categories.${category.id}`)}
                </button>
              ))}
            </div>

            {/* Results count & Clear filters */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {filteredTours.length} {t('tours.toursFound')}
              </span>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-foreground underline hover:no-underline"
                >
                  {t('tours.clearFilters')}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Tours Grid */}
      <section className="py-12 flex-1">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTours.map((tour) => {
              const tourId = tour._id || tour.id;
              return (
                <Link
                  key={tourId}
                  to={`/tours/${tourId}`}
                  className="group bg-white rounded-xl border border-border overflow-hidden hover:shadow-xl transition-all duration-300"
                >
                  {/* Tour Image */}
                  <div className="relative h-56 bg-secondary overflow-hidden">
                    <img
                      src={tour.image}
                      alt={tour.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/400x300?text=Tour+Image';
                        e.target.className = 'w-full h-full object-contain p-8';
                      }}
                    />
                    {/* Category Badge */}
                    <span className="absolute top-3 left-3 px-3 py-1 bg-foreground/90 text-background text-xs font-medium rounded-full">
                      {t(`tours.categories.${tour.category}`)}
                    </span>
                    {/* Featured Badge */}
                    {tour.featured && (
                      <span className="absolute top-3 right-3 px-2 py-1 bg-yellow-500 text-white text-xs font-medium rounded-full flex items-center gap-1">
                        <Star className="w-3 h-3 fill-white" />
                        {t('tours.featured')}
                      </span>
                    )}
                    {!tour.available && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="text-white font-semibold">{t('tours.unavailable')}</span>
                      </div>
                    )}
                  </div>

                  {/* Tour Info */}
                  <div className="p-5">
                    <div className="mb-3">
                      <h3 className="text-xl font-semibold group-hover:text-foreground/80 transition-colors mb-1">
                        {tour.name}
                      </h3>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="w-4 h-4" />
                        <span>{tour.location}</span>
                      </div>
                    </div>

                    {/* Short Description */}
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {tour.shortDescription}
                    </p>

                    {/* Tour Details */}
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-4">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{tour.duration}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>{tour.minGroupSize}-{tour.maxGroupSize} {t('common.passengers')}</span>
                      </div>
                    </div>

                    {/* Price & CTA */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-2xl font-bold">${tour.price}</p>
                        <p className="text-xs text-muted-foreground">
                          {t(`tours.${tour.priceType}`)}
                        </p>
                      </div>
                      <Button className="group-hover:bg-foreground/90" disabled={!tour.available}>
                        {t('tours.viewDetails')}
                      </Button>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {filteredTours.length === 0 && (
            <div className="text-center py-16">
              <p className="text-muted-foreground mb-4">{t('tours.noTours')}</p>
              {hasActiveFilters && (
                <Button variant="outline" onClick={clearFilters}>
                  {t('tours.clearFilters')}
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
