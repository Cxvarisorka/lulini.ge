import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import {
  Car, Shield, Clock, Award, Phone, CheckCircle,
  ArrowRight, Smartphone, Zap, Heart, ChevronDown, ChevronUp,
  DollarSign, Headphones, Navigation, Users, Mail, Loader2, Rocket
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { apiRequest } from '../services/api';

export function Home() {
  const { t } = useTranslation();
  const [openFaq, setOpenFaq] = useState(null);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistName, setWaitlistName] = useState('');
  const WAITLIST_BASE = 243;
  const [waitlistCount, setWaitlistCount] = useState(WAITLIST_BASE);
  const alreadyJoined = localStorage.getItem('waitlist_joined') === 'true';
  const [waitlistStatus, setWaitlistStatus] = useState(alreadyJoined ? 'success' : 'idle'); // idle | loading | success | error
  const [waitlistError, setWaitlistError] = useState('');
  const scrollRef = useScrollAnimation();

  // Countdown to April 1, 2026
  const LAUNCH_DATE = new Date('2026-04-01T00:00:00');
  const [countdown, setCountdown] = useState(() => {
    const diff = LAUNCH_DATE - new Date();
    if (diff <= 0) return null;
    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((diff / (1000 * 60)) % 60),
      seconds: Math.floor((diff / 1000) % 60),
    };
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = LAUNCH_DATE - new Date();
      if (diff <= 0) { setCountdown(null); clearInterval(timer); return; }
      setCountdown({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    apiRequest('/waitlist/count').then(data => setWaitlistCount(WAITLIST_BASE + data.count)).catch(() => {});
  }, []);

  const handleWaitlistSubmit = async (e) => {
    e.preventDefault();
    setWaitlistStatus('loading');
    setWaitlistError('');
    try {
      const data = await apiRequest('/waitlist', {
        method: 'POST',
        body: JSON.stringify({ email: waitlistEmail, name: waitlistName }),
      });
      setWaitlistCount(WAITLIST_BASE + data.count);
      setWaitlistStatus('success');
      setWaitlistEmail('');
      setWaitlistName('');
      localStorage.setItem('waitlist_joined', 'true');
    } catch (err) {
      setWaitlistError(err.message);
      setWaitlistStatus('error');
    }
  };

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqItems = [
    'download', 'callTaxi', 'payment', 'fare', 'safety', 'privacy', 'share', 'rating'
  ];

  return (
    <div ref={scrollRef} className="min-h-screen flex flex-col">
      <Header />

      {/* ===== HERO SECTION ===== */}
      <section className="relative min-h-[650px] md:min-h-[750px] flex items-center overflow-hidden">
        <div className="absolute inset-0 bg-purple-gradient-dark" />
        <div className="absolute inset-0 opacity-20 bg-no-repeat bg-cover bg-center" style={{ backgroundImage: "url('/pattern03.png')" }} />
        <div className="absolute inset-0 opacity-15">
          <div className="absolute top-20 right-[10%] w-[500px] h-[500px] bg-purple-500 rounded-full blur-[120px]" />
          <div className="absolute bottom-10 left-[5%] w-[400px] h-[400px] bg-purple-400 rounded-full blur-[100px]" />
        </div>
        <div className="container mx-auto px-4 relative z-10 pt-24 pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="anim-hero inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 mb-6">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-white/90 text-sm font-medium">{t('home.hero.badge')}</span>
              </div>
              <h1 className="anim-hero-delay-1 text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-white leading-tight">
                {t('home.hero.title')}
              </h1>
              <p className="anim-hero-delay-2 text-lg md:text-xl text-white/80 mb-8 leading-relaxed max-w-lg">
                {t('home.hero.subtitle')}
              </p>
              <div className="anim-hero-delay-3 flex flex-col sm:flex-row gap-3">
                <a href="#" className="inline-block transition-transform hover:scale-105">
                  <img src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg" alt="App Store" className="h-12" />
                </a>
                <a href="#" className="inline-block transition-transform hover:scale-105">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Google Play" className="h-12" />
                </a>
              </div>
            </div>
            <div className="anim-hero-delay-2 hidden lg:flex justify-center">
              <div className="relative">
                <div className="w-[280px] h-[560px] bg-white/5 backdrop-blur-sm rounded-[3rem] border border-white/10 p-3 shadow-purple-glow">
                  <img src="/screenshot.jpg" alt="Lulini App" className="w-full h-full object-cover object-top rounded-[2.4rem]" />
                </div>
                <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-primary rounded-2xl flex items-center justify-center shadow-purple-lg">
                  <Car className="w-10 h-10 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== WHY US SECTION ===== */}
      <section className="py-20 bg-purple-mesh" id="why-us">
        <div className="container mx-auto px-4">
          <div className="anim-ready anim-fade-up anim-duration-500 text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('home.whyChooseUs.title')}</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {t('home.whyChooseUs.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Shield, key: 'safety' },
              { icon: Smartphone, key: 'simple' },
              { icon: Heart, key: 'comfort' },
              { icon: Zap, key: 'local' }
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.key} className={`anim-ready anim-fade-up anim-duration-500 anim-delay-${index} bg-white rounded-2xl p-8 border border-border card-hover`}>
                  <div className="w-14 h-14 bg-primary/10 text-primary rounded-xl flex items-center justify-center mb-6">
                    <Icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-semibold mb-3">
                    {t(`home.whyChooseUs.items.${item.key}.title`)}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {t(`home.whyChooseUs.items.${item.key}.description`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== FOR PASSENGERS SECTION ===== */}
      <section className="py-12 md:py-20 overflow-hidden" id="passengers">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
            <div className="anim-ready anim-fade-up anim-duration-600">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 sm:mb-6">{t('home.passengers.title')}</h2>
              <p className="text-muted-foreground text-base sm:text-lg mb-6 sm:mb-8 leading-relaxed">
                {t('home.passengers.description')}
              </p>
              <div className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
                {['realtime', 'payment', 'support', 'rating'].map((key) => (
                  <div key={key} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                      <CheckCircle className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm sm:text-base text-foreground">{t(`home.passengers.features.${key}`)}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <a href="#" className="inline-block transition-transform hover:scale-105">
                  <img src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg" alt="App Store" className="h-10 sm:h-11" />
                </a>
                <a href="#" className="inline-block transition-transform hover:scale-105">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Google Play" className="h-10 sm:h-11" />
                </a>
              </div>
            </div>
            <div className="anim-ready anim-fade-up anim-duration-600 anim-delay-1 relative">
              <div className="bg-purple-gradient-subtle rounded-2xl sm:rounded-3xl p-4 sm:p-8 lg:p-12">
                <img
                  src="/woman-traveling-with-her-car.jpg"
                  alt="Passenger"
                  className="rounded-2xl w-full shadow-purple-lg object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOR DRIVERS SECTION ===== */}
      <section className="py-12 md:py-20 bg-purple-gradient-subtle overflow-hidden" id="drivers">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
            <div className="anim-ready anim-fade-up anim-duration-600 anim-delay-1 order-2 lg:order-1 relative">
              <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 lg:p-12 shadow-purple-sm">
                <img
                  src="/switching-gears-modern-businessman-trying-his-new-car-automobile-salon.jpg"
                  alt="Driver"
                  className="rounded-2xl w-full object-cover"
                />
              </div>
            </div>
            <div className="anim-ready anim-fade-up anim-duration-600 order-1 lg:order-2">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 sm:mb-6">{t('home.drivers.title')}</h2>
              <p className="text-muted-foreground text-base sm:text-lg mb-6 sm:mb-8 leading-relaxed">
                {t('home.drivers.description')}
              </p>
              <div className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
                {[
                  { icon: DollarSign, key: 'commission' },
                  { icon: Navigation, key: 'distance' },
                  { icon: Award, key: 'rewards' },
                  { icon: Headphones, key: 'support' }
                ].map(({ icon: Icon, key }) => (
                  <div key={key} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm sm:text-base text-foreground">{t(`home.drivers.benefits.${key}`)}</span>
                  </div>
                ))}
              </div>
              <Link to="/careers">
                <Button size="lg" className="gap-2">
                  {t('home.drivers.cta')}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SOCIAL RESPONSIBILITY ===== */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="anim-ready anim-scale anim-duration-500 w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Heart className="w-8 h-8 text-primary" />
            </div>
            <h2 className="anim-ready anim-fade-up anim-duration-500 anim-delay-1 text-3xl md:text-4xl font-bold mb-6">{t('home.social.title')}</h2>
            <p className="anim-ready anim-fade-up anim-duration-500 anim-delay-2 text-muted-foreground text-lg leading-relaxed mb-4">
              {t('home.social.description')}
            </p>
            <p className="anim-ready anim-fade-up anim-duration-500 anim-delay-3 text-muted-foreground leading-relaxed">
              {t('home.social.mission')}
            </p>
          </div>
        </div>
      </section>

      {/* ===== WAITING LIST SECTION ===== */}
      <section className="py-20 bg-purple-gradient-dark text-white relative overflow-hidden" id="waitlist">
        <div className="absolute inset-0 opacity-20 bg-no-repeat bg-cover bg-center" style={{ backgroundImage: "url('/pattern03.png')" }} />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-[20%] w-80 h-80 bg-purple-400 rounded-full blur-[120px]" />
          <div className="absolute bottom-10 right-[15%] w-64 h-64 bg-purple-300 rounded-full blur-[100px]" />
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-2xl mx-auto text-center">
            <div className="anim-ready anim-scale anim-duration-500 w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-6 border border-white/20">
              <Users className="w-8 h-8 text-white" />
            </div>
            <h2 className="anim-ready anim-fade-up anim-duration-500 anim-delay-1 text-3xl md:text-4xl font-bold mb-4">
              {t('home.waitlist.title')}
            </h2>
            <p className="anim-ready anim-fade-up anim-duration-500 anim-delay-2 text-white/70 text-lg mb-3">
              {t('home.waitlist.subtitle')}
            </p>

            {/* Counter + Success */}
            <div className="anim-ready anim-fade-up anim-duration-500 anim-delay-2 flex flex-col items-center gap-3 mb-8">
              <div className="inline-flex items-center gap-2.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-6 py-2.5">
                <Users className="w-5 h-5 text-purple-300" />
                <span className="text-white font-bold text-lg">{waitlistCount}</span>
                <span className="text-white/80 text-sm">{t('home.waitlist.count')}</span>
              </div>
              {waitlistStatus === 'success' && (
                <div className="animate-scale-in inline-flex items-center gap-2 bg-green-500/15 border border-green-400/30 rounded-full px-5 py-2">
                  <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                  <span className="text-sm text-green-300">{t('home.waitlist.successTitle')}</span>
                </div>
              )}
            </div>

            {/* Form */}
            {waitlistStatus !== 'success' && (
              <form onSubmit={handleWaitlistSubmit} className="anim-ready anim-fade-up anim-duration-500 anim-delay-3 space-y-3 max-w-md mx-auto">
                <input
                  type="text"
                  value={waitlistName}
                  onChange={(e) => setWaitlistName(e.target.value)}
                  placeholder={t('home.waitlist.namePlaceholder')}
                  className="w-full px-4 py-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-white/40 transition-colors"
                />
                <input
                  type="email"
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  placeholder={t('home.waitlist.emailPlaceholder')}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-white/40 transition-colors"
                />
                {waitlistStatus === 'error' && (
                  <p className="text-red-300 text-sm">{waitlistError}</p>
                )}
                <Button
                  type="submit"
                  disabled={waitlistStatus === 'loading'}
                  className="w-full py-3 bg-white text-purple-700 hover:bg-white/90 font-semibold rounded-xl gap-2"
                >
                  {waitlistStatus === 'loading' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t('home.waitlist.joining')}</>
                  ) : (
                    <><Mail className="w-4 h-4" /> {t('home.waitlist.joinButton')}</>
                  )}
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ===== COUNTDOWN SECTION ===== */}
      {countdown && (
        <section className="py-16 bg-white border-b border-border">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center">
              <div className="anim-ready anim-scale anim-duration-500 w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Rocket className="w-7 h-7 text-primary" />
              </div>
              <h2 className="anim-ready anim-fade-up anim-duration-500 anim-delay-1 text-2xl md:text-3xl font-bold mb-2">
                {t('home.countdown.title')}
              </h2>
              <p className="anim-ready anim-fade-up anim-duration-500 anim-delay-2 text-muted-foreground mb-8">
                {t('home.countdown.subtitle')}
              </p>
              <div className="anim-ready anim-fade-up anim-duration-500 anim-delay-3 flex justify-center gap-3 sm:gap-5">
                {[
                  { value: countdown.days, label: t('home.waitlist.days') },
                  { value: countdown.hours, label: t('home.waitlist.hours') },
                  { value: countdown.minutes, label: t('home.waitlist.minutes') },
                  { value: countdown.seconds, label: t('home.waitlist.seconds') },
                ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <div className="w-18 h-18 sm:w-22 sm:h-22 bg-purple-gradient-subtle border border-border rounded-2xl flex items-center justify-center p-4 sm:p-5">
                      <span className="text-3xl sm:text-4xl font-bold text-primary tabular-nums">
                        {String(item.value).padStart(2, '0')}
                      </span>
                    </div>
                    <span className="text-muted-foreground text-xs sm:text-sm mt-2 uppercase tracking-wider font-medium">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===== FAQ SECTION ===== */}
      <section className="py-20 bg-purple-mesh" id="faq">
        <div className="container mx-auto px-4">
          <div className="anim-ready anim-fade-up anim-duration-500 text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('home.faq.title')}</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {t('home.faq.subtitle')}
            </p>
          </div>
          <div className="max-w-3xl mx-auto space-y-3">
            {faqItems.map((key, index) => (
              <div
                key={key}
                className={`anim-ready anim-fade-up anim-duration-400 anim-delay-${Math.min(index, 4)} bg-white rounded-xl border border-border overflow-hidden transition-all`}
              >
                <button
                  onClick={() => toggleFaq(index)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-accent/50 transition-colors"
                >
                  <span className="font-medium pr-4">{t(`home.faq.items.${key}.question`)}</span>
                  {openFaq === index ? (
                    <ChevronUp className="w-5 h-5 text-primary shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
                  )}
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-5 text-muted-foreground leading-relaxed border-t border-border pt-4">
                    {t(`home.faq.items.${key}.answer`)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CONTACT SECTION ===== */}
      <section className="py-20" id="contact-section">
        <div className="container mx-auto px-4">
          <div className="anim-ready anim-fade-up anim-duration-500 text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('home.contactSection.title')}</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {t('home.contactSection.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { icon: Phone, key: 'call', link: 'tel:+995322112424' },
              { icon: Smartphone, key: 'email', link: 'mailto:info@lulini.ge' },
              { icon: Headphones, key: 'app' }
            ].map(({ icon: Icon, key, link }, index) => (
              <div key={key} className={`anim-ready anim-fade-up anim-duration-500 anim-delay-${index} bg-white rounded-2xl p-8 border border-border text-center card-hover`}>
                <div className="w-14 h-14 bg-primary/10 text-primary rounded-xl flex items-center justify-center mx-auto mb-5">
                  <Icon className="w-7 h-7" />
                </div>
                <h3 className="font-semibold mb-2">{t(`home.contactSection.methods.${key}.title`)}</h3>
                {link ? (
                  <a href={link} className="text-primary hover:underline text-sm">
                    {t(`home.contactSection.methods.${key}.value`)}
                  </a>
                ) : (
                  <p className="text-muted-foreground text-sm">{t(`home.contactSection.methods.${key}.value`)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== DOWNLOAD CTA ===== */}
      <section className="py-20 bg-purple-gradient-dark text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-no-repeat bg-cover bg-center" style={{ backgroundImage: "url('/pattern03.png')" }} />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 right-[20%] w-80 h-80 bg-purple-400 rounded-full blur-[120px]" />
          <div className="absolute bottom-10 left-[15%] w-64 h-64 bg-purple-300 rounded-full blur-[100px]" />
        </div>
        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="anim-ready anim-fade-up anim-duration-500 text-3xl md:text-4xl font-bold mb-4">{t('home.download.title')}</h2>
          <p className="anim-ready anim-fade-up anim-duration-500 anim-delay-1 text-white/70 text-lg mb-8 max-w-2xl mx-auto">
            {t('home.download.subtitle')}
          </p>
          <div className="anim-ready anim-fade-up anim-duration-500 anim-delay-2 flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#" className="inline-block transition-transform hover:scale-105">
              <img src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg" alt="App Store" className="h-14" />
            </a>
            <a href="#" className="inline-block transition-transform hover:scale-105">
              <img src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" alt="Google Play" className="h-14" />
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
