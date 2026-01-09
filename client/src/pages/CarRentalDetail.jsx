import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Users,
  Briefcase,
  Fuel,
  Settings2,
  DoorOpen,
  Snowflake,
  Check,
  Calendar,
  Shield,
  Gauge,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  MapPin,
  X,
  User,
  Mail,
  Phone
} from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { cn } from '../lib/utils';
import { useAdmin } from '../context/AdminContext';

export function CarRentalDetail() {
  const { carId } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getCarById, cityLocations, addRentalOrder } = useAdmin();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingSubmitted, setBookingSubmitted] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    startDate: '',
    endDate: '',
    name: '',
    email: '',
    phone: '',
    notes: ''
  });

  const car = getCarById(carId);
  const location = car ? cityLocations.find(loc => loc.id === car.locationId) : null;

  if (!car) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">{t('carRentals.notFound')}</h1>
            <Button onClick={() => navigate('/car-rentals')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('carRentals.backToList')}
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % car.images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + car.images.length) % car.images.length);
  };

  const specs = [
    { icon: Users, label: t('carRentals.specs.passengers'), value: car.passengers },
    { icon: Briefcase, label: t('carRentals.specs.luggage'), value: car.luggage },
    { icon: DoorOpen, label: t('carRentals.specs.doors'), value: car.doors },
    { icon: Settings2, label: t('carRentals.specs.transmission'), value: t(`carRentals.transmission.${car.transmission}`) },
    { icon: Fuel, label: t('carRentals.specs.fuel'), value: t(`carRentals.fuel.${car.fuelType}`) },
    { icon: Snowflake, label: t('carRentals.specs.ac'), value: car.airConditioning ? t('common.yes') : t('common.no') }
  ];

  const rentalInfo = [
    { icon: Calendar, label: t('carRentals.info.pricePerDay'), value: `$${car.pricePerDay}` },
    { icon: Shield, label: t('carRentals.info.deposit'), value: `$${car.deposit}` },
    { icon: Gauge, label: t('carRentals.info.mileage'), value: car.mileageLimit === 'unlimited' ? t('carRentals.unlimited') : car.mileageLimit },
    { icon: UserCheck, label: t('carRentals.info.minAge'), value: `${car.minAge}+` }
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Breadcrumb */}
      <div className="pt-20 pb-4 bg-secondary/30">
        <div className="container mx-auto px-4">
          <Link
            to="/car-rentals"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('carRentals.backToList')}
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <section className="py-8 flex-1">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Image Gallery */}
            <div className="space-y-4">
              {/* Main Image */}
              <div className="relative aspect-[4/3] bg-secondary rounded-2xl overflow-hidden">
                <img
                  src={car.images[currentImageIndex]}
                  alt={`${car.brand} ${car.model}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.src = 'https://cdn-icons-png.flaticon.com/512/55/55283.png';
                    e.target.className = 'w-full h-full object-contain p-16';
                  }}
                />

                {/* Navigation Arrows */}
                {car.images.length > 1 && (
                  <>
                    <button
                      onClick={prevImage}
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-colors shadow-lg"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={nextImage}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-colors shadow-lg"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}

                {/* Image Counter */}
                {car.images.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/60 text-white text-sm rounded-full">
                    {currentImageIndex + 1} / {car.images.length}
                  </div>
                )}

                {/* Category Badge */}
                <span className="absolute top-4 left-4 px-3 py-1 bg-foreground/90 text-background text-sm font-medium rounded-full">
                  {t(`carRentals.categories.${car.category}`)}
                </span>
              </div>

              {/* Thumbnail Strip */}
              {car.images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {car.images.map((image, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      className={cn(
                        "flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden border-2 transition-all",
                        currentImageIndex === index
                          ? "border-foreground"
                          : "border-transparent opacity-60 hover:opacity-100"
                      )}
                    >
                      <img
                        src={image}
                        alt={`${car.brand} ${car.model} - ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Car Details */}
            <div className="space-y-6">
              {/* Title & Price */}
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-3xl md:text-4xl font-bold">
                      {car.brand} {car.model}
                    </h1>
                    <p className="text-lg text-muted-foreground">{car.year}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold">${car.pricePerDay}</p>
                    <p className="text-sm text-muted-foreground">{t('carRentals.perDay')}</p>
                  </div>
                </div>
              </div>

              {/* Description */}
              <p className="text-muted-foreground leading-relaxed">
                {car.description}
              </p>

              {/* Specifications */}
              <div className="bg-secondary/50 rounded-xl p-5">
                <h3 className="font-semibold mb-4">{t('carRentals.specifications')}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {specs.map((spec, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <spec.icon className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">{spec.label}</p>
                        <p className="font-medium capitalize">{spec.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Features */}
              <div>
                <h3 className="font-semibold mb-3">{t('carRentals.features')}</h3>
                <div className="flex flex-wrap gap-2">
                  {car.features.map((feature, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-secondary rounded-full text-sm"
                    >
                      <Check className="w-3.5 h-3.5 text-green-600" />
                      {feature}
                    </span>
                  ))}
                </div>
              </div>

              {/* Rental Information */}
              <div className="bg-secondary/50 rounded-xl p-5">
                <h3 className="font-semibold mb-4">{t('carRentals.rentalInfo')}</h3>
                <div className="grid grid-cols-2 gap-4">
                  {rentalInfo.map((info, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                        <info.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{info.label}</p>
                        <p className="font-semibold">{info.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pickup Location */}
              {location && (
                <div className="bg-blue-50 rounded-xl p-5">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    {t('carRentals.pickupLocation')}
                  </h3>
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <p className="font-medium text-blue-900">{location.name}</p>
                      <p className="text-sm text-blue-700">{location.address}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Availability Status */}
              <div className={cn(
                "p-4 rounded-xl flex items-center gap-3",
                car.available
                  ? "bg-green-50 text-green-800"
                  : "bg-red-50 text-red-800"
              )}>
                <div className={cn(
                  "w-3 h-3 rounded-full",
                  car.available ? "bg-green-500" : "bg-red-500"
                )} />
                <span className="font-medium">
                  {car.available ? t('carRentals.available') : t('carRentals.unavailable')}
                </span>
              </div>

              {/* Book Button */}
              <Button
                size="xl"
                className="w-full text-lg py-6"
                disabled={!car.available}
                onClick={() => setShowBookingModal(true)}
              >
                {t('carRentals.bookNow')} - ${car.pricePerDay}/{t('carRentals.day')}
              </Button>

              {/* Contact Info */}
              <p className="text-center text-sm text-muted-foreground">
                {t('carRentals.contactInfo')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />

      {/* Booking Modal */}
      {showBookingModal && (
        <BookingModal
          car={car}
          location={location}
          bookingForm={bookingForm}
          setBookingForm={setBookingForm}
          bookingSubmitted={bookingSubmitted}
          onClose={() => {
            setShowBookingModal(false);
            setBookingSubmitted(false);
            setBookingForm({
              startDate: '',
              endDate: '',
              name: '',
              email: '',
              phone: '',
              notes: ''
            });
          }}
          onSubmit={() => {
            // Calculate days
            const start = new Date(bookingForm.startDate);
            const end = new Date(bookingForm.endDate);
            const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
            const totalPrice = days * car.pricePerDay;

            addRentalOrder({
              carId: car.id,
              carName: `${car.brand} ${car.model}`,
              locationId: car.locationId,
              startDate: bookingForm.startDate,
              endDate: bookingForm.endDate,
              days,
              pricePerDay: car.pricePerDay,
              totalPrice,
              name: bookingForm.name,
              email: bookingForm.email,
              phone: bookingForm.phone,
              notes: bookingForm.notes
            });

            setBookingSubmitted(true);
          }}
          t={t}
        />
      )}
    </div>
  );
}

function BookingModal({ car, location, bookingForm, setBookingForm, bookingSubmitted, onClose, onSubmit, t }) {
  const handleChange = (e) => {
    const { name, value } = e.target;
    setBookingForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit();
  };

  // Calculate rental days and total
  const calculateTotal = () => {
    if (!bookingForm.startDate || !bookingForm.endDate) return null;
    const start = new Date(bookingForm.startDate);
    const end = new Date(bookingForm.endDate);
    if (end < start) return null;
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return { days, total: days * car.pricePerDay };
  };

  const pricing = calculateTotal();
  const isValid = bookingForm.startDate && bookingForm.endDate && bookingForm.name && bookingForm.email && bookingForm.phone && pricing;

  if (bookingSubmitted) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-background rounded-2xl w-full max-w-md p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Booking Submitted!</h2>
          <p className="text-muted-foreground mb-6">
            Your rental request for {car.brand} {car.model} has been received. We'll contact you shortly to confirm your booking.
          </p>
          <Button onClick={onClose} className="w-full">
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-background rounded-2xl w-full max-w-lg my-8 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold">Book {car.brand} {car.model}</h2>
            <p className="text-sm text-muted-foreground">${car.pricePerDay}/day</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Pickup Date *</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                  value={bookingForm.startDate}
                  onChange={handleChange}
                  min={new Date().toISOString().split('T')[0]}
                  required
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">Return Date *</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="endDate"
                  name="endDate"
                  type="date"
                  value={bookingForm.endDate}
                  onChange={handleChange}
                  min={bookingForm.startDate || new Date().toISOString().split('T')[0]}
                  required
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* Pickup Location */}
          {location && (
            <div className="bg-blue-50 rounded-lg p-3 flex items-center gap-3">
              <MapPin className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-900">Pickup Location</p>
                <p className="text-sm text-blue-700">{location.name} - {location.address}</p>
              </div>
            </div>
          )}

          {/* Contact Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  name="name"
                  value={bookingForm.name}
                  onChange={handleChange}
                  placeholder="John Doe"
                  required
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={bookingForm.email}
                  onChange={handleChange}
                  placeholder="john@example.com"
                  required
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={bookingForm.phone}
                  onChange={handleChange}
                  placeholder="+1 234 567 890"
                  required
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <textarea
                id="notes"
                name="notes"
                value={bookingForm.notes}
                onChange={handleChange}
                rows={2}
                placeholder="Any special requests..."
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none"
              />
            </div>
          </div>

          {/* Pricing Summary */}
          {pricing && (
            <div className="bg-foreground text-background rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm opacity-80">
                <span>${car.pricePerDay} x {pricing.days} days</span>
                <span>${pricing.total}</span>
              </div>
              <div className="flex justify-between text-sm opacity-80">
                <span>Deposit (refundable)</span>
                <span>${car.deposit}</span>
              </div>
              <div className="border-t border-background/20 pt-2 mt-2">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>${pricing.total}</span>
                </div>
              </div>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!isValid}
          >
            Submit Booking Request
          </Button>
        </form>
      </div>
    </div>
  );
}
