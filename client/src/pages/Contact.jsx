import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Phone, MapPin, Send, Clock, ArrowRight } from 'lucide-react';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export function Contact() {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 1000));

    setIsSubmitting(false);
    setIsSubmitted(true);
    setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
  };

  const contactCards = [
    {
      icon: Mail,
      title: t('contactPage.info.email'),
      value: 'info@gotours.ge',
      link: 'mailto:info@gotours.ge'
    },
    {
      icon: Phone,
      title: t('contactPage.info.phone'),
      value: '+1 (234) 567-890',
      link: 'tel:+1234567890'
    },
    {
      icon: MapPin,
      title: t('contactPage.info.address'),
      value: 'Tbilisi, Georgia'
    },
    {
      icon: Clock,
      title: t('contactPage.info.hours'),
      value: t('contactPage.info.hoursValue')
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* Hero Section */}
      <section className="pt-24 pb-16 md:pt-28 md:pb-20 bg-foreground text-background relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="container mx-auto px-4 relative">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight">
              {t('contactPage.hero.title')}
            </h1>
            <p className="text-background/70 text-lg md:text-xl leading-relaxed">
              {t('contactPage.hero.subtitle')}
            </p>
          </div>
        </div>
      </section>

      {/* Contact Cards */}
      <section className="py-8 md:py-12 -mt-10 relative z-10">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {contactCards.map((card, index) => (
              <div
                key={index}
                className="group bg-background rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-border hover:-translate-y-1"
              >
                <div className="w-12 h-12 rounded-xl bg-foreground flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <card.icon className="h-6 w-6 text-background" />
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

      {/* Main Content */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">

            {/* Left Side - Info */}
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold mb-4">
                  {t('contactPage.info.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {t('contactPage.info.description')}
                </p>
              </div>

              {/* Map Placeholder */}
              <div className="relative rounded-2xl overflow-hidden bg-secondary h-64 lg:h-80">
                <div className="absolute inset-0 bg-foreground/5 flex items-center justify-center">
                  <div className="text-center">
                    <MapPin className="h-12 w-12 text-foreground/20 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">123 Transfer Street</p>
                    <p className="text-muted-foreground">Tbilisi, Georgia</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side - Form */}
            <div>
              <div className="bg-secondary/50 rounded-2xl p-6 md:p-8 border border-border">
                <h2 className="text-2xl md:text-3xl font-bold mb-8">
                  {t('contactPage.form.title')}
                </h2>

                {isSubmitted ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-foreground rounded-full flex items-center justify-center mx-auto mb-6">
                      <Send className="h-8 w-8 text-background" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold mb-3">
                      {t('contactPage.form.successTitle')}
                    </h3>
                    <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                      {t('contactPage.form.successMessage')}
                    </p>
                    <Button size="lg" onClick={() => setIsSubmitted(false)}>
                      {t('contactPage.form.sendAnother')}
                      <ArrowRight className="h-5 w-5 ml-2" />
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">{t('contactPage.form.name')}</Label>
                        <Input
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          placeholder={t('contactPage.form.namePlaceholder')}
                          required
                          className="h-12 rounded-lg"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">{t('contactPage.form.email')}</Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          value={formData.email}
                          onChange={handleChange}
                          placeholder={t('contactPage.form.emailPlaceholder')}
                          required
                          className="h-12 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="phone">{t('contactPage.form.phone')}</Label>
                        <Input
                          id="phone"
                          name="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={handleChange}
                          placeholder={t('contactPage.form.phonePlaceholder')}
                          className="h-12 rounded-lg"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="subject">{t('contactPage.form.subject')}</Label>
                        <Input
                          id="subject"
                          name="subject"
                          value={formData.subject}
                          onChange={handleChange}
                          placeholder={t('contactPage.form.subjectPlaceholder')}
                          required
                          className="h-12 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">{t('contactPage.form.message')}</Label>
                      <textarea
                        id="message"
                        name="message"
                        value={formData.message}
                        onChange={handleChange}
                        placeholder={t('contactPage.form.messagePlaceholder')}
                        required
                        rows={5}
                        className="flex w-full rounded-lg border border-input bg-background px-3 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                      />
                    </div>

                    <Button type="submit" size="lg" className="w-full h-12 rounded-lg" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <span className="animate-spin mr-2">
                            <svg className="h-5 w-5" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          </span>
                          {t('contactPage.form.sending')}
                        </>
                      ) : (
                        <>
                          <Send className="h-5 w-5 mr-2" />
                          {t('contactPage.form.submit')}
                        </>
                      )}
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex-1" />
      <Footer />
    </div>
  );
}
