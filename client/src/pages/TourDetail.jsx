import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Clock, Users, MapPin, Globe, Mountain, Check, X as XIcon,
  Calendar, User, Mail, Phone, LogIn, Loader2, ChevronLeft, ChevronRight, Star
} from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { cn } from '../lib/utils';
import { useUser } from '../context/UserContext';
import { tourService } from '../services/tour';
import { rentalService } from '../services/rental';
import { transferService } from '../services/transfer';

export function TourDetail() {
  const { tourId } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isLoggedIn } = useUser();
  const [tour, setTour] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [bookingSubmitted, setBookingSubmitted] = useState(false);

  // User's existing rentals and transfers
  const [myRentals, setMyRentals] = useState([]);
  const [myTransfers, setMyTransfers] = useState([]);

  const [bookingForm, setBookingForm] = useState({
    date: '',
    time: '10:00',
    participants: 1,
    language: 'English',
    carRentalId: '',
    transferId: '',
    name: '',
    email: '',
    phone: '',
    notes: '',
    specialRequirements: ''
  });

  useEffect(() => {
    fetchTour();
  }, [tourId]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchMyRentalsAndTransfers();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && user) {
      setBookingForm(prev => ({
        ...prev,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        email: user.email || '',
        phone: user.phone || ''
      }));
    }
  }, [isLoggedIn, user]);

  const fetchTour = async () => {
    try {
      setLoading(true);
      const response = await tourService.getTourById(tourId);
      setTour(response.data.tour);
    } catch (error) {
      console.error('Error fetching tour:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyRentalsAndTransfers = async () => {
    try {
      const [rentalsRes, transfersRes] = await Promise.all([
        rentalService.getMyOrders(),
        transferService.getMyOrders()
      ]);
      setMyRentals(rentalsRes.data.orders || []);
      setMyTransfers(transfersRes.data.orders || []);
    } catch (error) {
      console.error('Error fetching user orders:', error);
    }
  };

  const handleBookNow = () => {
    if (!isLoggedIn) {
      setShowLoginPrompt(true);
      return;
    }
    setShowBookingModal(true);
  };

  const handleSubmitBooking = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const orderData = {
        tourId: tour._id,
        ...bookingForm
      };

      await tourService.createOrder(orderData);
      setBookingSubmitted(true);

      setTimeout(() => {
        navigate('/profile?tab=tours');
      }, 2000);
    } catch (error) {
      console.error('Booking error:', error);
      setSubmitError(error.message || t('tours.booking.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const allImages = tour ? [tour.image, ...(tour.images || [])] : [];
  const totalPrice = tour ? (tour.priceType === 'perPerson' ? tour.price * bookingForm.participants : tour.price) : 0;

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % allImages.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!tour) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">{t('tours.notFound')}</h2>
            <Link to="/tours">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('tours.backToList')}
              </Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 pt-20 md:pt-24">
        {/* Back Button */}
        <div className="container mx-auto px-4 py-4">
          <Link
            to="/tours"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('tours.backToList')}
          </Link>
        </div>

        {/* Image Gallery */}
        <section className="container mx-auto px-4 mb-8">
          <div className="relative h-96 rounded-xl overflow-hidden bg-secondary">
            <img
              src={allImages[currentImageIndex]}
              alt={tour.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.src = 'https://via.placeholder.com/800x400?text=Tour+Image';
              }}
            />

            {allImages.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                  {allImages.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      className={cn(
                        "w-2 h-2 rounded-full transition-all",
                        index === currentImageIndex ? "bg-white w-8" : "bg-white/50"
                      )}
                    />
                  ))}
                </div>
              </>
            )}

            {tour.featured && (
              <div className="absolute top-4 right-4 px-3 py-1.5 bg-yellow-500 text-white text-sm font-medium rounded-full flex items-center gap-1">
                <Star className="w-4 h-4 fill-white" />
                {t('tours.featured')}
              </div>
            )}
          </div>
        </section>

        {/* Tour Details */}
        <section className="container mx-auto px-4 pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Header */}
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <span className="px-3 py-1 bg-secondary rounded-full">
                    {t(`tours.categories.${tour.category}`)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {tour.location}
                  </span>
                </div>
                <h1 className="text-4xl font-bold mb-4">{tour.name}</h1>
                <p className="text-lg text-muted-foreground">{tour.description}</p>
              </div>

              {/* Tour Info Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-secondary rounded-lg">
                  <Clock className="w-5 h-5 mb-2 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">{t('tours.duration')}</div>
                  <div className="font-semibold">{tour.duration}</div>
                </div>
                <div className="p-4 bg-secondary rounded-lg">
                  <Users className="w-5 h-5 mb-2 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">{t('tours.groupSize')}</div>
                  <div className="font-semibold">{tour.minGroupSize}-{tour.maxGroupSize}</div>
                </div>
                <div className="p-4 bg-secondary rounded-lg">
                  <Globe className="w-5 h-5 mb-2 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">{t('tours.languages')}</div>
                  <div className="font-semibold">{tour.languages.join(', ')}</div>
                </div>
                <div className="p-4 bg-secondary rounded-lg">
                  <Mountain className="w-5 h-5 mb-2 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">{t('tours.difficulty')}</div>
                  <div className="font-semibold capitalize">{t(`tours.difficultyLevels.${tour.difficulty}`)}</div>
                </div>
              </div>

              {/* What's Included */}
              {tour.includes && tour.includes.length > 0 && (
                <div className="p-6 bg-secondary rounded-lg">
                  <h3 className="text-xl font-semibold mb-4">{t('tours.includes')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {tour.includes.map((item, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* What's Not Included */}
              {tour.excludes && tour.excludes.length > 0 && (
                <div className="p-6 bg-secondary rounded-lg">
                  <h3 className="text-xl font-semibold mb-4">{t('tours.excludes')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {tour.excludes.map((item, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <XIcon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Itinerary */}
              {tour.itinerary && tour.itinerary.length > 0 && (
                <div className="p-6 bg-secondary rounded-lg">
                  <h3 className="text-xl font-semibold mb-4">{t('tours.itinerary')}</h3>
                  <div className="space-y-4">
                    {tour.itinerary.map((item, index) => (
                      <div key={index} className="flex gap-4">
                        <div className="flex-shrink-0 w-16 text-sm font-semibold text-muted-foreground">
                          {item.time}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold mb-1">{item.title}</h4>
                          <p className="text-muted-foreground">{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Info */}
              <div className="space-y-4">
                <div className="p-6 bg-secondary rounded-lg">
                  <h3 className="text-lg font-semibold mb-2">{t('tours.meetingPoint')}</h3>
                  <p className="text-muted-foreground">{tour.meetingPoint}</p>
                </div>

                {tour.requirements && (
                  <div className="p-6 bg-secondary rounded-lg">
                    <h3 className="text-lg font-semibold mb-2">{t('tours.requirements')}</h3>
                    <p className="text-muted-foreground">{tour.requirements}</p>
                  </div>
                )}

                <div className="p-6 bg-secondary rounded-lg">
                  <h3 className="text-lg font-semibold mb-2">{t('tours.cancellationPolicy')}</h3>
                  <p className="text-muted-foreground">{tour.cancellationPolicy}</p>
                </div>
              </div>
            </div>

            {/* Booking Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 p-6 bg-white border border-border rounded-xl shadow-lg">
                <div className="mb-6">
                  <div className="text-3xl font-bold mb-1">${tour.price}</div>
                  <div className="text-sm text-muted-foreground">
                    {t(`tours.${tour.priceType}`)}
                  </div>
                </div>

                <Button
                  className="w-full mb-4"
                  onClick={handleBookNow}
                  disabled={!tour.available}
                >
                  {tour.available ? t('tours.bookNow') : t('tours.unavailable')}
                </Button>

                <div className="text-xs text-center text-muted-foreground">
                  {t('tours.cancellationPolicy')}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Login Prompt Modal */}
      {showLoginPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-8 max-w-md w-full">
            <div className="text-center mb-6">
              <LogIn className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-2xl font-bold mb-2">{t('booking.loginRequired')}</h3>
              <p className="text-muted-foreground">{t('booking.loginRequiredDesc')}</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowLoginPrompt(false)}
              >
                {t('common.back')}
              </Button>
              <Button
                className="flex-1"
                onClick={() => navigate('/signin')}
              >
                {t('booking.signInButton')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {showBookingModal && !bookingSubmitted && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl p-8 max-w-2xl w-full my-8">
            <h2 className="text-2xl font-bold mb-6">{t('tours.booking.title')}</h2>

            <form onSubmit={handleSubmitBooking} className="space-y-6">
              {/* Tour Details */}
              <div className="p-4 bg-secondary rounded-lg">
                <div className="flex gap-4">
                  <img
                    src={tour.image}
                    alt={tour.name}
                    className="w-20 h-20 object-cover rounded-lg"
                  />
                  <div className="flex-1">
                    <h4 className="font-semibold">{tour.name}</h4>
                    <p className="text-sm text-muted-foreground">{tour.duration}</p>
                    <p className="text-lg font-bold mt-1">${tour.price} {t(`tours.${tour.priceType}`)}</p>
                  </div>
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="date">{t('tours.booking.date')}</Label>
                  <Input
                    id="date"
                    type="date"
                    value={bookingForm.date}
                    onChange={(e) => setBookingForm({ ...bookingForm, date: e.target.value })}
                    required
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div>
                  <Label htmlFor="time">{t('tours.booking.time')}</Label>
                  <Input
                    id="time"
                    type="time"
                    value={bookingForm.time}
                    onChange={(e) => setBookingForm({ ...bookingForm, time: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Participants & Language */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="participants">{t('tours.booking.participants')}</Label>
                  <Input
                    id="participants"
                    type="number"
                    value={bookingForm.participants}
                    onChange={(e) => setBookingForm({ ...bookingForm, participants: parseInt(e.target.value) })}
                    min={tour.minGroupSize}
                    max={tour.maxGroupSize}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="language">{t('tours.booking.language')}</Label>
                  <select
                    id="language"
                    value={bookingForm.language}
                    onChange={(e) => setBookingForm({ ...bookingForm, language: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  >
                    {tour.languages.map(lang => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Optional Car Rental */}
              <div>
                <Label htmlFor="carRental">{t('tours.booking.withCarRental')}</Label>
                <select
                  id="carRental"
                  value={bookingForm.carRentalId}
                  onChange={(e) => setBookingForm({ ...bookingForm, carRentalId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-foreground/20"
                >
                  <option value="">{t('tours.booking.selectCarRental')}</option>
                  {myRentals.filter(r => ['pending', 'confirmed'].includes(r.status)).map(rental => (
                    <option key={rental._id} value={rental._id}>
                      {rental.carSnapshot?.brand} {rental.carSnapshot?.model} - {rental.startDate} to {rental.endDate}
                    </option>
                  ))}
                </select>
                {myRentals.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-1">{t('tours.booking.noCarRentals')}</p>
                )}
              </div>

              {/* Optional Transfer */}
              <div>
                <Label htmlFor="transfer">{t('tours.booking.withTransfer')}</Label>
                <select
                  id="transfer"
                  value={bookingForm.transferId}
                  onChange={(e) => setBookingForm({ ...bookingForm, transferId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-foreground/20"
                >
                  <option value="">{t('tours.booking.selectTransfer')}</option>
                  {myTransfers.filter(t => ['pending', 'confirmed'].includes(t.status)).map(transfer => (
                    <option key={transfer._id} value={transfer._id}>
                      {transfer.tripType} - {transfer.pickupAddress} to {transfer.dropoffAddress} - {transfer.date}
                    </option>
                  ))}
                </select>
                {myTransfers.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-1">{t('tours.booking.noTransfers')}</p>
                )}
              </div>

              {/* Customer Info */}
              <div className="space-y-4">
                <h3 className="font-semibold">{t('tours.booking.yourInfo')}</h3>
                <div>
                  <Label htmlFor="name">{t('tours.booking.name')}</Label>
                  <Input
                    id="name"
                    value={bookingForm.name}
                    onChange={(e) => setBookingForm({ ...bookingForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">{t('tours.booking.email')}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={bookingForm.email}
                      onChange={(e) => setBookingForm({ ...bookingForm, email: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">{t('tours.booking.phone')}</Label>
                    <Input
                      id="phone"
                      value={bookingForm.phone}
                      onChange={(e) => setBookingForm({ ...bookingForm, phone: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="notes">{t('tours.booking.notes')}</Label>
                  <textarea
                    id="notes"
                    value={bookingForm.notes}
                    onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-foreground/20"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="specialRequirements">{t('tours.booking.specialRequirements')}</Label>
                  <textarea
                    id="specialRequirements"
                    value={bookingForm.specialRequirements}
                    onChange={(e) => setBookingForm({ ...bookingForm, specialRequirements: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-foreground/20"
                    rows={2}
                  />
                </div>
              </div>

              {/* Total Price */}
              <div className="p-4 bg-secondary rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-semibold">{t('tours.booking.tour')}</span>
                  <span>${tour.price} × {bookingForm.participants}</span>
                </div>
                <div className="flex justify-between items-center text-lg font-bold border-t pt-2">
                  <span>{t('tours.booking.totalPrice')}</span>
                  <span>${totalPrice}</span>
                </div>
              </div>

              {submitError && (
                <div className="p-4 bg-red-50 text-red-600 rounded-lg">
                  {submitError}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowBookingModal(false);
                    setSubmitError(null);
                  }}
                  disabled={isSubmitting}
                >
                  {t('common.back')}
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('tours.booking.booking')}
                    </>
                  ) : (
                    t('tours.booking.confirmBooking')
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {bookingSubmitted && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-2xl font-bold mb-2">{t('tours.booking.success')}</h3>
            <p className="text-muted-foreground mb-4">Redirecting to your profile...</p>
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
