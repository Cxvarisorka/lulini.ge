import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export function TrackRedirect() {
  const { rideId } = useParams();
  const { t } = useTranslation();
  const [shareToken, setShareToken] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function resolve() {
      try {
        const res = await fetch(`${API_URL}/safety/rides/track/${rideId}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setShareToken(data.data.shareToken);
      } catch {
        setError(true);
      }
    }
    resolve();
  }, [rideId]);

  if (shareToken) {
    return <Navigate to={`/ride/shared/${shareToken}`} replace />;
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50 pt-24 pb-16">
        <div className="container mx-auto max-w-lg px-4 flex flex-col items-center justify-center py-20">
          {error ? (
            <>
              <AlertTriangle className="h-12 w-12 text-red-500" />
              <h2 className="mt-4 text-xl font-semibold">{t('sharedRide.error')}</h2>
              <p className="mt-2 text-gray-500">{t('sharedRide.notFound')}</p>
            </>
          ) : (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="mt-4 text-gray-500">{t('sharedRide.loading')}</p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
