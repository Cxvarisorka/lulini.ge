import { useTranslation } from 'react-i18next';
import { Mail, Phone, MapPin } from 'lucide-react';
import { TrustpilotHorizontal } from './TrustpilotWidget';

export function Footer() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-foreground text-background" id="contact">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-background rounded-md flex items-center justify-center">
                <span className="text-foreground font-bold text-lg">G</span>
              </div>
              <span className="font-semibold text-lg">{t('header.title')}</span>
            </div>
            <p className="text-sm opacity-80 max-w-xs">
              {t('header.subtitle')}
            </p>
            {/* Trustpilot Widget */}
            <div className="pt-2">
              <TrustpilotHorizontal theme="dark" />
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="font-semibold">{t('header.nav.services')}</h4>
            <ul className="space-y-2 text-sm opacity-80">
              <li>
                <a href="#" className="hover:opacity-100 transition-opacity">
                  Airport Transfers
                </a>
              </li>
              <li>
                <a href="#" className="hover:opacity-100 transition-opacity">
                  City Tours
                </a>
              </li>
              <li>
                <a href="#" className="hover:opacity-100 transition-opacity">
                  Business Travel
                </a>
              </li>
              <li>
                <a href="#" className="hover:opacity-100 transition-opacity">
                  Events & Weddings
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h4 className="font-semibold">{t('footer.contact')}</h4>
            <ul className="space-y-3 text-sm opacity-80">
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <a href="mailto:info@gotours.ge" className="hover:opacity-100 transition-opacity">
                  info@gotours.ge
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <a href="tel:+1234567890" className="hover:opacity-100 transition-opacity">
                  +1 (234) 567-890
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5" />
                <span>123 Transfer Street, City, Country</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-background/20 mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm opacity-60">
            © {currentYear} GoTours Georgia. {t('footer.rights')}.
          </p>
          <div className="flex items-center gap-6 text-sm opacity-60">
            <a href="#" className="hover:opacity-100 transition-opacity">
              {t('footer.privacy')}
            </a>
            <a href="#" className="hover:opacity-100 transition-opacity">
              {t('footer.terms')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
