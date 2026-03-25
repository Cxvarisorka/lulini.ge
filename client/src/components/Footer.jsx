import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';
import { Mail, Phone, MapPin } from 'lucide-react';
import { TrustpilotHorizontal } from './TrustpilotWidget';

export function Footer() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const handleHashClick = useCallback((e, hash) => {
    e.preventDefault();
    const id = hash.replace('#', '');
    if (location.pathname === '/') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate('/');
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [location.pathname, navigate]);
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-purple-gradient-dark text-white">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="space-y-4 md:col-span-1">
            <Link to="/" className="inline-block">
              <img src="/logo/png_files_app1024 × 1024.png" alt="Lulini" className="w-30" />
            </Link>
            <p className="text-sm text-white/70 max-w-xs">
              {t('home.hero.subtitle').slice(0, 80)}...
            </p>
            {/* Social Links */}
            <div className="flex items-center gap-3 pt-1">
              <a href="#" className="w-9 h-9 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
              <a href="#" className="w-9 h-9 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20 transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
            </div>
            <div className="pt-1">
              <TrustpilotHorizontal theme="dark" />
            </div>
          </div>

          {/* Services */}
          <div className="space-y-4">
            <h4 className="font-semibold text-sm uppercase tracking-wider text-white/90">{t('footer.services')}</h4>
            <ul className="space-y-2.5 text-sm text-white/60">
              <li>
                <a href="/#passengers" onClick={(e) => handleHashClick(e, '#passengers')} className="hover:text-white transition-colors cursor-pointer">
                  {t('footer.taxiService')}
                </a>
              </li>
              <li>
                <a href="/#drivers" onClick={(e) => handleHashClick(e, '#drivers')} className="hover:text-white transition-colors cursor-pointer">
                  {t('footer.businessTravel')}
                </a>
              </li>
              <li>
                <Link to="/careers" className="hover:text-white transition-colors">
                  {t('header.nav.careers')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div className="space-y-4">
            <h4 className="font-semibold text-sm uppercase tracking-wider text-white/90">{t('header.nav.support')}</h4>
            <ul className="space-y-2.5 text-sm text-white/60">
              <li>
                <Link to="/support" className="hover:text-white transition-colors">
                  {t('header.nav.support')}
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-white transition-colors">
                  {t('footer.contact')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h4 className="font-semibold text-sm uppercase tracking-wider text-white/90">{t('footer.contact')}</h4>
            <ul className="space-y-2.5 text-sm text-white/60">
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0" />
                <a href="tel:322118811" className="hover:text-white transition-colors">
                  322 11 88 11
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0" />
                <a href="mailto:info@lulini.ge" className="hover:text-white transition-colors">
                  info@lulini.ge
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Tbilisi, Georgia</span>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div className="space-y-4">
            <h4 className="font-semibold text-sm uppercase tracking-wider text-white/90">{t('footer.legal')}</h4>
            <ul className="space-y-2.5 text-sm text-white/60">
              <li>
                <Link to="/terms" className="hover:text-white transition-colors">
                  {t('footer.terms')}
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="hover:text-white transition-colors">
                  {t('footer.privacy')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-white/10 mt-10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/50">
            &copy; {currentYear} Lulini. {t('footer.rights')}.
          </p>
          <p className="text-sm text-white/50">
            {t('footer.company')}
          </p>
        </div>
      </div>
    </footer>
  );
}
