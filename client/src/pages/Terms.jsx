import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useTranslation } from 'react-i18next';

export function Terms() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 bg-gray-50">
        <div className="container mx-auto px-4 py-16 max-w-3xl">
          <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
          <p className="text-gray-500 mb-10 text-sm">Effective date: March 13, 2026</p>

          <div className="prose prose-gray max-w-none space-y-6">
            <p>Welcome to Lulini. By using our mobile applications or services, you agree to these Terms of Service. Please read them carefully.</p>

            <h2 className="text-xl font-semibold mt-8">1. Overview</h2>
            <p>Lulini provides a technology platform that connects passengers seeking transportation with independent drivers. We are a technology service provider — we do not provide transportation services directly.</p>

            <h2 className="text-xl font-semibold mt-8">2. Eligibility</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You must be at least 18 years old to use Lulini.</li>
              <li>Drivers must hold a valid driver's license and meet all applicable local requirements.</li>
              <li>You must provide accurate and complete registration information.</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8">3. User Accounts</h2>
            <p>You are responsible for maintaining the security of your account. You must not share your account credentials with others. You are responsible for all activity that occurs under your account.</p>

            <h2 className="text-xl font-semibold mt-8">4. Services</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Passengers:</strong> You may request rides through the app. Fares are calculated based on distance, duration, and applicable rates. You agree to pay the fare displayed at the end of each ride.</li>
              <li><strong>Drivers:</strong> You may accept or decline ride requests at your discretion. You agree to provide safe, lawful transportation and to follow all traffic laws.</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8">5. Payments</h2>
            <p>Passengers agree to pay the fare for completed rides. Payment methods and pricing are displayed in the app. Lulini may charge service fees as disclosed in the app.</p>

            <h2 className="text-xl font-semibold mt-8">6. Cancellations</h2>
            <p>Passengers and drivers may cancel ride requests. Repeated or late cancellations may result in fees or account restrictions as described in the app.</p>

            <h2 className="text-xl font-semibold mt-8">7. User Conduct</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use the service for any unlawful purpose.</li>
              <li>Harass, threaten, or discriminate against other users.</li>
              <li>Damage or tamper with vehicles.</li>
              <li>Attempt to defraud the platform, other users, or drivers.</li>
              <li>Use the platform to compete with Lulini or scrape data.</li>
            </ul>

            <h2 className="text-xl font-semibold mt-8">8. Safety</h2>
            <p>While we strive to promote safety, Lulini does not guarantee the safety of any ride. Passengers and drivers use the service at their own risk. We encourage all users to follow safety best practices.</p>

            <h2 className="text-xl font-semibold mt-8">9. Intellectual Property</h2>
            <p>All content, trademarks, and technology provided through the Lulini apps are owned by Lulini. You may not copy, modify, or distribute any part of our service without permission.</p>

            <h2 className="text-xl font-semibold mt-8">10. Limitation of Liability</h2>
            <p>Lulini provides its services "as is" without warranties of any kind. To the maximum extent permitted by law, Lulini shall not be liable for indirect, incidental, or consequential damages arising from your use of the service.</p>

            <h2 className="text-xl font-semibold mt-8">11. Account Termination</h2>
            <p>We may suspend or terminate your account if you violate these Terms or engage in conduct that we determine is harmful to other users, drivers, or Lulini.</p>

            <h2 className="text-xl font-semibold mt-8">12. Changes to Terms</h2>
            <p>We may update these Terms from time to time. Continued use of the service after changes are posted constitutes acceptance of the updated Terms.</p>

            <h2 className="text-xl font-semibold mt-8">13. Governing Law</h2>
            <p>These Terms are governed by the laws of Georgia. Any disputes shall be resolved in the courts of Tbilisi, Georgia.</p>

            <h2 className="text-xl font-semibold mt-8">14. Contact Us</h2>
            <p>If you have questions about these Terms, contact us at <a href="mailto:support@lulini.ge" className="text-purple-600 hover:underline">support@lulini.ge</a>.</p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
