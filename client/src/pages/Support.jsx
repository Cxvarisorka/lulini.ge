import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, ArrowRight, HelpCircle, CreditCard, UserCog, Car, Bug, Lightbulb, MoreHorizontal, MessageCircle, Mail, Phone } from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import { apiRequest } from '../services/api';

const CATEGORY_ICONS = {
  ride_issue: Car,
  payment: CreditCard,
  account: UserCog,
  driver_feedback: MessageCircle,
  app_bug: Bug,
  suggestion: Lightbulb,
  other: MoreHorizontal,
};

export function Support() {
  const { t } = useTranslation();
  const scrollRef = useScrollAnimation();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    category: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const categories = [
    { value: 'ride_issue', label: t('supportPage.categories.ride_issue'), icon: Car },
    { value: 'payment', label: t('supportPage.categories.payment'), icon: CreditCard },
    { value: 'account', label: t('supportPage.categories.account'), icon: UserCog },
    { value: 'driver_feedback', label: t('supportPage.categories.driver_feedback'), icon: MessageCircle },
    { value: 'app_bug', label: t('supportPage.categories.app_bug'), icon: Bug },
    { value: 'suggestion', label: t('supportPage.categories.suggestion'), icon: Lightbulb },
    { value: 'other', label: t('supportPage.categories.other'), icon: MoreHorizontal },
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const selectCategory = (value) => {
    setFormData(prev => ({ ...prev, category: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.category) {
      setError(t('supportPage.form.selectCategory'));
      return;
    }
    setIsSubmitting(true);
    setError('');

    try {
      await apiRequest('/support', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setIsSubmitted(true);
      setFormData({ name: '', email: '', category: '', subject: '', message: '' });
    } catch (err) {
      setError(err.message || t('supportPage.form.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div ref={scrollRef} className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* Hero Section */}
      <section className="pt-24 pb-16 md:pt-28 md:pb-20 bg-purple-gradient text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-no-repeat bg-cover bg-center" style={{ backgroundImage: "url('/pattern03.png')" }} />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 right-20 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-10 w-96 h-96 bg-purple-300 rounded-full blur-3xl" />
        </div>
        <div className="container mx-auto px-4 relative">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="anim-hero text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight">
              {t('supportPage.hero.title')}
            </h1>
            <p className="anim-hero-delay-1 text-white/80 text-lg md:text-xl leading-relaxed">
              {t('supportPage.hero.subtitle')}
            </p>
          </div>
        </div>
      </section>

      {/* Quick Help Cards */}
      <section className="py-8 md:py-12 -mt-10 relative z-10">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
            {[
              { icon: Mail, title: t('supportPage.quickHelp.email'), value: 'info@lulini.ge', link: 'mailto:info@lulini.ge' },
              { icon: Phone, title: t('supportPage.quickHelp.phone'), value: '322 11 88 11', link: 'tel:322118811' },
              { icon: HelpCircle, title: t('supportPage.quickHelp.faq'), value: t('supportPage.quickHelp.faqValue'), link: '/#faq', isRoute: true },
            ].map((card, index) => (
              <div
                key={index}
                className={`anim-ready anim-fade-up anim-duration-500 anim-delay-${index} group bg-background rounded-xl p-6 shadow-purple-sm hover:shadow-purple transition-all duration-300 border border-border card-hover`}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <card.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">{card.title}</h3>
                {card.link ? (
                  <a href={card.link} className="text-base font-semibold text-foreground hover:text-foreground/70 transition-colors">
                    {card.value}
                  </a>
                ) : (
                  <p className="text-base font-semibold text-foreground">{card.value}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Form Section */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="anim-ready anim-fade-up anim-duration-600">
              <div className="bg-secondary/50 rounded-2xl p-6 md:p-8 border border-border">
                <h2 className="text-2xl md:text-3xl font-bold mb-2">
                  {t('supportPage.form.title')}
                </h2>
                <p className="text-muted-foreground mb-8">
                  {t('supportPage.form.description')}
                </p>

                {isSubmitted ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-6 shadow-purple">
                      <Send className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold mb-3">
                      {t('supportPage.form.successTitle')}
                    </h3>
                    <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                      {t('supportPage.form.successMessage')}
                    </p>
                    <Button size="lg" onClick={() => setIsSubmitted(false)}>
                      {t('supportPage.form.submitAnother')}
                      <ArrowRight className="h-5 w-5 ml-2" />
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Category Selection */}
                    <div className="space-y-2">
                      <Label>{t('supportPage.form.categoryLabel')}</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {categories.map((cat) => {
                          const Icon = cat.icon;
                          const isSelected = formData.category === cat.value;
                          return (
                            <button
                              key={cat.value}
                              type="button"
                              onClick={() => selectCategory(cat.value)}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all duration-200 ${
                                isSelected
                                  ? 'bg-primary text-white border-primary shadow-sm'
                                  : 'bg-background text-foreground border-border hover:border-primary/50 hover:bg-primary/5'
                              }`}
                            >
                              <Icon className="h-4 w-4 flex-shrink-0" />
                              <span className="truncate">{cat.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">{t('supportPage.form.name')}</Label>
                        <Input
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          placeholder={t('supportPage.form.namePlaceholder')}
                          required
                          className="h-12 rounded-lg"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">{t('supportPage.form.email')}</Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          value={formData.email}
                          onChange={handleChange}
                          placeholder={t('supportPage.form.emailPlaceholder')}
                          required
                          className="h-12 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subject">{t('supportPage.form.subject')}</Label>
                      <Input
                        id="subject"
                        name="subject"
                        value={formData.subject}
                        onChange={handleChange}
                        placeholder={t('supportPage.form.subjectPlaceholder')}
                        required
                        className="h-12 rounded-lg"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">{t('supportPage.form.message')}</Label>
                      <textarea
                        id="message"
                        name="message"
                        value={formData.message}
                        onChange={handleChange}
                        placeholder={t('supportPage.form.messagePlaceholder')}
                        required
                        rows={5}
                        className="flex w-full rounded-lg border border-input bg-background px-3 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                      />
                    </div>

                    {error && (
                      <p className="text-sm text-red-500 font-medium">{error}</p>
                    )}

                    <Button type="submit" size="lg" className="w-full h-12 rounded-lg" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <span className="animate-spin mr-2">
                            <svg className="h-5 w-5" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          </span>
                          {t('supportPage.form.sending')}
                        </>
                      ) : (
                        <>
                          <Send className="h-5 w-5 mr-2" />
                          {t('supportPage.form.submit')}
                        </>
                      )}
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </div>
      </section>

      <div className="flex-1" />
      <Footer />
    </div>
  );
}
