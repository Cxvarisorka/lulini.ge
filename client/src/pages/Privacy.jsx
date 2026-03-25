import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useTranslation } from 'react-i18next';

export function Privacy() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 bg-gray-50">
        <div className="container mx-auto px-4 py-16 max-w-3xl">
          <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-gray-500 mb-10 text-sm">Effective date: March 13, 2026</p>

          <div className="prose prose-gray max-w-none space-y-6">
            <p>Lulini ("we", "us", or "our") operates the Lulini mobile applications (passenger and driver apps) and related services. This Privacy Policy explains how we collect, use, and protect your information.</p>

            <h2 className="text-xl font-semibold mt-8">1. Information We Collect</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account information:</strong> Name, phone number, and email address provided during registration.</li>
              <li><strong>Location data:</strong> Real-time GPS location while the app is in use (and in the background for drivers during active rides) to match riders with nearby drivers, calculate routes, and provide navigation.</li>
              <li><strong>Ride data:</strong> Pickup and drop-off locations, ride duration, distance, fare, and payment status.</li>
              <li><strong>Device information:</strong> Device type, operating system, unique device identifiers, and push notification tokens.</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8">2. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide, operate, and improve our ride-hailing services.</li>
              <li>Match passengers with available drivers in real time.</li>
              <li>Process payments and send ride receipts.</li>
              <li>Send push notifications about ride status, promotions, and service updates.</li>
              <li>Ensure safety and resolve disputes.</li>
              <li>Comply with legal obligations.</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8">3. Location Data</h2>
            <p>Location data is essential to our service. Passengers share their location when requesting a ride. Drivers share their location while online to receive ride requests. We do not track your location when the app is closed, except for drivers during an active ride who have granted background location permission.</p>

            <h2 className="text-xl font-semibold mt-8">4. Data Sharing</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Between users:</strong> Passengers see driver name, vehicle info, and real-time location during a ride. Drivers see passenger name and pickup/drop-off locations.</li>
              <li><strong>Service providers:</strong> We use Google Maps for routing and geocoding. These providers receive location data necessary to provide their services.</li>
              <li><strong>Legal requirements:</strong> We may disclose information if required by law or to protect the safety of our users.</li>
            </ul>
            <p>We do not sell your personal information to third parties.</p>

            <h2 className="text-xl font-semibold mt-8">5. Data Security</h2>
            <p>We use industry-standard security measures including encrypted connections (HTTPS/TLS), secure authentication tokens, and access controls to protect your data.</p>

            <h2 className="text-xl font-semibold mt-8">6. Data Retention</h2>
            <p>We retain your account and ride data for as long as your account is active. You may request deletion of your account and associated data by contacting us.</p>

            <h2 className="text-xl font-semibold mt-8">7. Your Rights</h2>
            <p>You have the right to access, correct, or delete your personal data. You can manage location permissions through your device settings. To exercise these rights, contact us at <a href="mailto:info@lulini.ge" className="text-purple-600 hover:underline">info@lulini.ge</a>.</p>

            <h2 className="text-xl font-semibold mt-8">8. Children's Privacy</h2>
            <p>Our services are not directed to children under 18. We do not knowingly collect personal information from children.</p>

            <h2 className="text-xl font-semibold mt-8">9. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of significant changes through the app or by email.</p>

            <h2 className="text-xl font-semibold mt-8">10. Contact Us</h2>
            <p>If you have questions about this Privacy Policy, contact us at <a href="mailto:info@lulini.ge" className="text-purple-600 hover:underline">info@lulini.ge</a>.</p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
