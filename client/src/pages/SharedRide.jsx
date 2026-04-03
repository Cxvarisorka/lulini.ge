import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, Car, Clock, User, Star, AlertTriangle, Loader2 } from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  driver_arrived: 'bg-purple-100 text-purple-800',
  in_progress: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
};

const POLL_INTERVAL = 10000; // 10 seconds

export function SharedRide() {
  const { token } = useParams();
  const { t } = useTranslation();
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let intervalId;

    async function fetchRide() {
      try {
        const res = await fetch(`${API_URL}/safety/rides/shared/${token}`);

        if (res.status === 410) {
          setExpired(true);
          setLoading(false);
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || t('sharedRide.notFound'));
        }

        const data = await res.json();
        setRide(data.data);
        setError(null);

        // Stop polling if ride is completed or cancelled
        if (data.data.status === 'completed' || data.data.status === 'cancelled') {
          clearInterval(intervalId);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchRide();
    intervalId = setInterval(fetchRide, POLL_INTERVAL);

    return () => clearInterval(intervalId);
  }, [token, t]);

  const formatTime = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50 pt-24 pb-16">
        <div className="container mx-auto max-w-lg px-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="mt-4 text-gray-500">{t('sharedRide.loading')}</p>
            </div>
          )}

          {expired && (
            <Card className="text-center">
              <CardContent className="py-12">
                <AlertTriangle className="mx-auto h-12 w-12 text-yellow-500" />
                <h2 className="mt-4 text-xl font-semibold">{t('sharedRide.expired')}</h2>
                <p className="mt-2 text-gray-500">{t('sharedRide.expiredDesc')}</p>
              </CardContent>
            </Card>
          )}

          {error && !expired && !loading && (
            <Card className="text-center">
              <CardContent className="py-12">
                <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
                <h2 className="mt-4 text-xl font-semibold">{t('sharedRide.error')}</h2>
                <p className="mt-2 text-gray-500">{error}</p>
              </CardContent>
            </Card>
          )}

          {ride && !expired && !loading && (
            <>
              {/* Status */}
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle className="text-lg">{t('sharedRide.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-gray-400" />
                    <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[ride.status] || 'bg-gray-100 text-gray-800'}`}>
                      {t(`sharedRide.status.${ride.status}`)}
                    </span>
                  </div>
                  {ride.startTime && (
                    <p className="mt-2 text-sm text-gray-500">
                      {t('sharedRide.startedAt')}: {formatTime(ride.startTime)}
                    </p>
                  )}
                  {ride.endTime && (
                    <p className="mt-1 text-sm text-gray-500">
                      {t('sharedRide.endedAt')}: {formatTime(ride.endTime)}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Locations */}
              <Card className="mb-4">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {ride.pickup && (
                      <div className="flex items-start gap-3">
                        <MapPin className="mt-0.5 h-5 w-5 text-green-500 shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-gray-400 uppercase">{t('sharedRide.pickup')}</p>
                          <p className="text-sm">{ride.pickup.address}</p>
                        </div>
                      </div>
                    )}
                    {ride.dropoff && (
                      <div className="flex items-start gap-3">
                        <MapPin className="mt-0.5 h-5 w-5 text-red-500 shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-gray-400 uppercase">{t('sharedRide.dropoff')}</p>
                          <p className="text-sm">{ride.dropoff.address}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Driver */}
              {ride.driver && (
                <Card className="mb-4">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      {ride.driver.profileImage ? (
                        <img
                          src={ride.driver.profileImage}
                          alt=""
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200">
                          <User className="h-6 w-6 text-gray-500" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{ride.driver.firstName}</p>
                        {ride.driver.rating && (
                          <div className="flex items-center gap-1 text-sm text-gray-500">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span>{ride.driver.rating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {ride.driver.vehicle && (
                      <div className="mt-4 flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                        <Car className="h-5 w-5 text-gray-400" />
                        <div className="text-sm">
                          <p className="font-medium">
                            {ride.driver.vehicle.color} {ride.driver.vehicle.make} {ride.driver.vehicle.model}
                          </p>
                          <p className="text-gray-500">{ride.driver.vehicle.licensePlate}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Vehicle type */}
              {ride.vehicleType && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <Car className="h-5 w-5 text-gray-400" />
                      <span className="text-sm capitalize">{ride.vehicleType}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
