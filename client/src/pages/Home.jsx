import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Car, Plane, Map, Shield, Clock, Award, Users, MapPin, Star, Phone, CheckCircle, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { TrustpilotCarousel, TrustpilotHorizontal } from '../components/TrustpilotWidget';

export function Home() {
  const { t } = useTranslation();

  const services = [
    {
      id: 'carRentals',
      icon: Car,
      link: '/car-rentals'
    },
    {
      id: 'transfers',
      icon: Plane,
      link: '/transfers'
    },
    {
      id: 'tours',
      icon: Map,
      link: null
    }
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero Section with Background Image */}
      <section className="relative min-h-[600px] md:min-h-[700px] flex items-center">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1565008576549-57569a49371d?w=1920&h=1080&fit=crop"
            alt="Tbilisi Georgia"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/30" />
        </div>
        <div className="container mx-auto px-4 relative z-10 pt-20">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-white">
              {t('home.hero.title')}
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-8">
              {t('home.hero.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/transfers">
                <Button size="lg" className="gap-2 w-full sm:w-auto">
                  <Plane className="w-5 h-5" />
                  {t('home.cta.bookTransfer')}
                </Button>
              </Link>
              <Link to="/car-rentals">
                <Button size="lg" variant="outline" className="gap-2 w-full sm:w-auto bg-white/10 border-white text-white hover:bg-white hover:text-foreground">
                  <Car className="w-5 h-5" />
                  {t('home.cta.rentCar')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Services Cards Section */}
      <section className="py-16 bg-secondary/30" id="services">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 -mt-24 relative z-20">
            {services.map((service) => {
              const Icon = service.icon;
              return (
                <div
                  key={service.id}
                  className="bg-white rounded-xl border border-border overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1 p-8 text-center"
                >
                  <div className="w-16 h-16 bg-foreground text-background rounded-full flex items-center justify-center mx-auto mb-6">
                    <Icon className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">
                    {t(`home.services.${service.id}.title`)}
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    {t(`home.services.${service.id}.description`)}
                  </p>
                  {service.link ? (
                    <Link to={service.link}>
                      <Button variant="outline" className="gap-2">
                        {t('home.services.learnMore')}
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  ) : (
                    <Button variant="outline" disabled>
                      {t('home.services.comingSoon')}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Trustpilot Rating Banner */}
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 bg-white rounded-xl p-6 shadow-sm border border-border max-w-2xl mx-auto">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rated</span>
              <span className="font-bold text-lg">Excellent</span>
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-[#00b67a] text-[#00b67a]" />
                ))}
              </div>
            </div>
            <div className="flex-1 max-w-xs">
              <TrustpilotHorizontal />
            </div>
          </div>
        </div>
      </section>

      {/* Airport Transfers Section - Image Left, Text Right */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800&h=600&fit=crop"
                alt="Airport Transfer"
                className="rounded-2xl shadow-2xl w-full"
              />
              <div className="absolute -bottom-6 -right-6 bg-foreground text-background p-4 rounded-xl shadow-lg hidden md:block">
                <p className="text-3xl font-bold">24/7</p>
                <p className="text-sm opacity-80">{t('home.transferSection.available')}</p>
              </div>
            </div>
            <div>
              <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {t('home.transferSection.label')}
              </span>
              <h2 className="text-3xl md:text-4xl font-bold mt-2 mb-6">
                {t('home.transferSection.title')}
              </h2>
              <p className="text-muted-foreground mb-6 text-lg">
                {t('home.transferSection.description')}
              </p>
              <ul className="space-y-3 mb-8">
                {['meetGreet', 'flightTracking', 'fixedPrices', 'professional'].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <span>{t(`home.transferSection.features.${item}`)}</span>
                  </li>
                ))}
              </ul>
              <Link to="/transfers">
                <Button size="lg" className="gap-2">
                  {t('home.transferSection.cta')}
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Car Rentals Section - Text Left, Image Right */}
      <section className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {t('home.rentalSection.label')}
              </span>
              <h2 className="text-3xl md:text-4xl font-bold mt-2 mb-6">
                {t('home.rentalSection.title')}
              </h2>
              <p className="text-muted-foreground mb-6 text-lg">
                {t('home.rentalSection.description')}
              </p>
              <ul className="space-y-3 mb-8">
                {['wideSelection', 'flexibleRental', 'insurance', 'support'].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <span>{t(`home.rentalSection.features.${item}`)}</span>
                  </li>
                ))}
              </ul>
              <Link to="/car-rentals">
                <Button size="lg" className="gap-2">
                  {t('home.rentalSection.cta')}
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            </div>
            <div className="relative order-1 lg:order-2">
              <img
                src="https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop"
                alt="Car Rental"
                className="rounded-2xl shadow-2xl w-full"
              />
              <div className="absolute -bottom-6 -left-6 bg-foreground text-background p-4 rounded-xl shadow-lg hidden md:block">
                <p className="text-3xl font-bold">50+</p>
                <p className="text-sm opacity-80">{t('home.rentalSection.cars')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">
            {t('home.whyChooseUs.title')}
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            {t('home.whyChooseUs.subtitle')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Shield, key: 'safety' },
              { icon: Clock, key: 'availability' },
              { icon: Award, key: 'quality' },
              { icon: Users, key: 'experience' }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.key} className="text-center p-6">
                  <div className="w-14 h-14 bg-foreground text-background rounded-full flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-7 h-7" />
                  </div>
                  <h3 className="font-semibold mb-2">
                    {t(`home.whyChooseUs.items.${item.key}.title`)}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t(`home.whyChooseUs.items.${item.key}.description`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Popular Destinations Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">
            {t('home.destinations.title')}
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            {t('home.destinations.subtitle')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { key: 'tbilisi', image: 'https://images.unsplash.com/photo-1565008576549-57569a49371d?w=400&h=300&fit=crop' },
              { key: 'batumi', image: 'https://images.unsplash.com/photo-1590077428593-a55bb07c4665?w=400&h=300&fit=crop' },
              { key: 'kazbegi', image: 'https://images.unsplash.com/photo-1584646098378-0874589d76b1?w=400&h=300&fit=crop' },
              { key: 'kakheti', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop' },
              { key: 'borjomi', image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop' },
              { key: 'svaneti', image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&h=300&fit=crop' }
            ].map((dest) => (
              <div
                key={dest.key}
                className="group relative h-64 rounded-xl overflow-hidden cursor-pointer"
              >
                <img
                  src={dest.image}
                  alt={t(`home.destinations.places.${dest.key}.name`)}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="w-4 h-4" />
                    <span className="text-sm opacity-80">
                      {t(`home.destinations.places.${dest.key}.distance`)}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold">
                    {t(`home.destinations.places.${dest.key}.name`)}
                  </h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">
            {t('home.testimonials.title')}
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
            {t('home.testimonials.subtitle')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {['review1', 'review2', 'review3'].map((review) => (
              <div
                key={review}
                className="bg-white rounded-xl p-6 shadow-sm border border-border"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-4 italic">
                  "{t(`home.testimonials.reviews.${review}.text`)}"
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center font-semibold">
                    {t(`home.testimonials.reviews.${review}.name`).charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium">{t(`home.testimonials.reviews.${review}.name`)}</p>
                    <p className="text-sm text-muted-foreground">{t(`home.testimonials.reviews.${review}.location`)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Trustpilot Reviews */}
          <div className="mt-12 max-w-4xl mx-auto">
            <TrustpilotCarousel />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-foreground text-background">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('home.cta.title')}
          </h2>
          <p className="text-lg opacity-80 mb-8 max-w-2xl mx-auto">
            {t('home.cta.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/transfers">
              <Button size="lg" variant="secondary" className="gap-2">
                <Plane className="w-5 h-5" />
                {t('home.cta.bookTransfer')}
              </Button>
            </Link>
            <Link to="/car-rentals">
              <Button size="lg" variant="outline" className="gap-2 border-background text-background hover:bg-background hover:text-foreground">
                <Car className="w-5 h-5" />
                {t('home.cta.rentCar')}
              </Button>
            </Link>
          </div>
          <div className="mt-8 flex items-center justify-center gap-2 text-sm opacity-80">
            <Phone className="w-4 h-4" />
            <span>{t('home.cta.phone')}</span>
          </div>
        </div>
      </section>

      <div className="flex-1" />

      <Footer />
    </div>
  );
}
