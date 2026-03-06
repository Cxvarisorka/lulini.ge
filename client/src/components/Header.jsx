import { useState, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, X, Globe, ChevronDown, User, LogOut } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { useUser } from '../context/UserContext';

const languages = [
  { code: 'en', name: 'English', flag: '\u{1F1EC}\u{1F1E7}' },
  { code: 'ka', name: '\u10E5\u10D0\u10E0\u10D7\u10E3\u10DA\u10D8', flag: '\u{1F1EC}\u{1F1EA}' }
];

export function Header() {
  const { t, i18n } = useTranslation();
  const { user, isLoggedIn, logout } = useUser();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const currentLang = languages.find(l => l.code === i18n.language) || languages[0];

  const changeLanguage = (code) => {
    i18n.changeLanguage(code);
    setIsLangOpen(false);
  };

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
    setIsMenuOpen(false);
  }, [location.pathname, navigate]);

  const navItems = [
    { key: 'whyUs', href: '/#why-us' },
    { key: 'passengers', href: '/#passengers' },
    { key: 'drivers', href: '/#drivers' },
    { key: 'faq', href: '/#faq' },
    { key: 'contact', href: '/contact', isRoute: true },
    { key: 'careers', href: '/careers', isRoute: true }
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo/png_files_ App 1024 × 1024.png" alt="Lulini" className="w-40" />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-6">
            {navItems.map((item) => (
              item.isRoute ? (
                <Link
                  key={item.key}
                  to={item.href}
                  className={cn(
                    "text-sm font-medium transition-colors whitespace-nowrap",
                    location.pathname === item.href
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(`header.nav.${item.key}`)}
                </Link>
              ) : (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={(e) => handleHashClick(e, item.href.replace('/', ''))}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap cursor-pointer"
                >
                  {t(`header.nav.${item.key}`)}
                </a>
              )
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Language Dropdown */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsLangOpen(!isLangOpen)}
                className="hidden sm:flex items-center gap-1 flex-shrink-0"
              >
                <Globe className="h-4 w-4" />
                <span className="text-xs uppercase">{currentLang.code}</span>
                <ChevronDown className="h-3 w-3" />
              </Button>

              {isLangOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsLangOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-lg shadow-lg overflow-hidden z-50 min-w-[140px]">
                    {languages.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => changeLanguage(lang.code)}
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-secondary transition-colors",
                          lang.code === i18n.language && "bg-secondary font-medium"
                        )}
                      >
                        <span>{lang.flag}</span>
                        <span>{lang.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* User Profile (shown only when logged in) */}
            {isLoggedIn && (
              <div className="relative hidden lg:block">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-1.5"
                >
                  <div className="w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0">
                    {user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <span className="max-w-[100px] truncate text-sm">{user.name || 'User'}</span>
                  <ChevronDown className="h-3 w-3 flex-shrink-0" />
                </Button>

                {isProfileOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsProfileOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-lg shadow-lg overflow-hidden z-50 w-[220px]">
                      <div className="px-3 py-2 border-b border-border">
                        <p className="font-medium text-sm truncate">{user.name || 'User'}</p>
                        <p className="text-xs text-muted-foreground truncate break-all">{user.email}</p>
                      </div>
                      <Link
                        to="/profile"
                        className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-secondary transition-colors"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <User className="h-4 w-4" />
                        My Profile
                      </Link>
                      <button
                        onClick={() => {
                          logout();
                          setIsProfileOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-secondary transition-colors text-red-600"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        <div
          className={cn(
            "lg:hidden overflow-hidden transition-all duration-300",
            isMenuOpen ? "max-h-[80vh] pb-6" : "max-h-0"
          )}
        >
          <nav className="flex flex-col gap-1 pt-4 border-t border-border mt-2">
            {navItems.map((item) => (
              item.isRoute ? (
                <Link
                  key={item.key}
                  to={item.href}
                  className={cn(
                    "px-4 py-3 text-base font-medium rounded-lg transition-colors",
                    location.pathname === item.href
                      ? "text-white bg-primary"
                      : "text-foreground hover:bg-accent"
                  )}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {t(`header.nav.${item.key}`)}
                </Link>
              ) : (
                <a
                  key={item.key}
                  href={item.href}
                  className="px-4 py-3 text-base font-medium text-foreground hover:bg-accent rounded-lg transition-colors cursor-pointer"
                  onClick={(e) => handleHashClick(e, item.href.replace('/', ''))}
                >
                  {t(`header.nav.${item.key}`)}
                </a>
              )
            ))}

            {/* Divider */}
            <div className="my-2 border-t border-border" />

            {/* Mobile Language Selector */}
            <div className="px-4 py-2">
              <p className="text-sm text-muted-foreground mb-3 flex items-center gap-2 font-medium">
                <Globe className="h-4 w-4" />
                Language
              </p>
              <div className="grid grid-cols-2 gap-2">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      changeLanguage(lang.code);
                      setIsMenuOpen(false);
                    }}
                    className={cn(
                      "px-3 py-2.5 text-sm rounded-lg flex items-center gap-2 transition-colors border",
                      lang.code === i18n.language
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-foreground border-border hover:border-purple-300 hover:bg-accent"
                    )}
                  >
                    <span>{lang.flag}</span>
                    <span className="truncate">{lang.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="my-2 border-t border-border" />

            {isLoggedIn && (
              <div className="px-4 pt-2 space-y-3">
                <Link to="/profile" className="block" onClick={() => setIsMenuOpen(false)}>
                  <Button variant="outline" className="w-full flex items-center justify-center gap-2 py-2.5 text-foreground border-border hover:bg-accent">
                    <User className="h-4 w-4" />
                    My Profile
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => {
                    logout();
                    setIsMenuOpen(false);
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
