import { useTranslation } from 'react-i18next';
import { Clock, DollarSign, Headphones, Users, CheckCircle, FileText, UserCheck, Car, Phone } from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

export function Careers() {
  const { t } = useTranslation();

  const benefits = [
    { icon: Clock, key: 'flexibility', color: 'bg-violet-100 text-violet-700' },
    { icon: DollarSign, key: 'earnings', color: 'bg-emerald-100 text-emerald-700' },
    { icon: Headphones, key: 'support', color: 'bg-blue-100 text-blue-700' },
    { icon: Users, key: 'community', color: 'bg-amber-100 text-amber-700' },
  ];

  const requirements = ['license', 'age', 'vehicle', 'clean', 'smartphone'];

  const steps = [
    { key: 'apply', icon: FileText, color: 'bg-violet-100 text-violet-700' },
    { key: 'review', icon: UserCheck, color: 'bg-emerald-100 text-emerald-700' },
    { key: 'drive', icon: Car, color: 'bg-blue-100 text-blue-700' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-violet-950 via-violet-800 to-violet-700 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 right-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-20 w-96 h-96 bg-violet-400 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32 lg:py-40">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              {t('careers.hero.title')}
            </h1>
            <p className="text-lg md:text-xl text-violet-100 leading-relaxed">
              {t('careers.hero.subtitle')}
            </p>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 md:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              {t('careers.benefits.title')}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t('careers.benefits.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {benefits.map(({ icon: Icon, key, color }) => (
              <div
                key={key}
                className="bg-muted/30 rounded-2xl p-8 border border-border hover:shadow-md transition-shadow"
              >
                <div className={`w-14 h-14 rounded-xl ${color} flex items-center justify-center mb-6`}>
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-foreground">
                  {t(`careers.benefits.${key}.title`)}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {t(`careers.benefits.${key}.description`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Requirements */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              {t('careers.requirements.title')}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t('careers.requirements.subtitle')}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-8 md:p-12 shadow-sm border border-border">
            <div className="space-y-5">
              {requirements.map((req) => (
                <div key={req} className="flex items-center gap-4">
                  <CheckCircle className="h-6 w-6 text-emerald-500 shrink-0" />
                  <span className="text-lg text-foreground">
                    {t(`careers.requirements.${req}`)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How to Apply */}
      <section className="py-20 md:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              {t('careers.howToApply.title')}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t('careers.howToApply.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {steps.map(({ key, icon: Icon, color }, i) => (
              <div key={key} className="text-center relative">
                <div className={`w-16 h-16 rounded-full ${color} flex items-center justify-center mx-auto mb-6`}>
                  <Icon className="h-8 w-8" />
                </div>
                {i < 2 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-violet-100" />
                )}
                <h3 className="text-xl font-semibold mb-3 text-foreground">
                  {t(`careers.howToApply.steps.${key}.title`)}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {t(`careers.howToApply.steps.${key}.description`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 md:py-28 bg-gradient-to-br from-violet-950 via-violet-800 to-violet-700 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('careers.cta.title')}
          </h2>
          <p className="text-lg text-violet-100 mb-10 max-w-2xl mx-auto">
            {t('careers.cta.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href={`tel:${t('careers.cta.phone')}`}
              className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-white text-violet-900 font-semibold rounded-xl hover:bg-violet-50 transition-colors text-lg"
            >
              <Phone className="h-5 w-5" />
              {t('careers.cta.button')}
            </a>
            <div className="text-violet-200">
              <p className="text-sm">{t('careers.cta.callUs')}</p>
              <a href={`tel:${t('careers.cta.phone')}`} className="text-xl font-semibold text-white hover:text-violet-200">
                {t('careers.cta.phone')}
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
