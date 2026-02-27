import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Car } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useUser } from '../context/UserContext';

export function SignIn() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useUser();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await login(formData.email, formData.password);
      navigate('/profile');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Form */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-8 xl:px-12 bg-background">
        <div className="w-full max-w-md mx-auto">
          {/* Logo */}
          <Link to="/" className="anim-hero flex items-center gap-2 mb-8">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-purple-sm">
              <span className="text-white font-bold text-xl">L</span>
            </div>
            <span className="font-semibold text-xl">{t('header.title')}</span>
          </Link>

          {/* Header */}
          <div className="anim-hero-delay-1 mb-8">
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              {t('auth.signIn.title')}
            </h1>
            <p className="text-muted-foreground">
              {t('auth.signIn.subtitle')}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="anim-hero-delay-2 space-y-5">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.signIn.email')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder={t('auth.signIn.emailPlaceholder')}
                  required
                  className="h-12 pl-10 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('auth.signIn.password')}</Label>
                <Link
                  to="/forgot-password"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('auth.signIn.forgotPassword')}
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder={t('auth.signIn.passwordPlaceholder')}
                  required
                  className="h-12 pl-10 pr-10 rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full h-12 rounded-xl text-base"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="animate-spin mr-2">
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </span>
                  {t('auth.signIn.signingIn')}
                </>
              ) : (
                <>
                  {t('auth.signIn.signInButton')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </form>

          {/* Admin Login Info */}
          <p className="anim-hero-delay-3 mt-8 text-center text-muted-foreground text-sm">
            {t('auth.signIn.adminOnly')}
          </p>
        </div>
      </div>

      {/* Right Side - Image/Branding */}
      <div className="hidden lg:flex lg:flex-1 bg-purple-gradient-dark text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-no-repeat bg-cover bg-center" style={{ backgroundImage: "url('/pattern03.png')" }} />
        <div className="absolute inset-0 opacity-15">
          <div className="absolute top-20 right-10 w-72 h-72 bg-purple-500 rounded-full blur-[100px]" />
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-purple-400 rounded-full blur-[120px]" />
        </div>

        <div className="relative flex flex-col justify-center items-center px-12 xl:px-16 w-full">
          <div className="max-w-lg text-center">
            <div className="anim-hero-delay-1 w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mb-8 mx-auto">
              <Car className="h-8 w-8" />
            </div>
            <h2 className="anim-hero-delay-2 text-4xl xl:text-5xl font-bold mb-6 leading-tight">
              {t('auth.signIn.heroTitle')}
            </h2>
            <p className="anim-hero-delay-3 text-background/70 text-lg leading-relaxed mb-8">
              {t('auth.signIn.heroSubtitle')}
            </p>

            {/* Features */}
            <div className="anim-hero-delay-3 space-y-4">
              {['feature1', 'feature2', 'feature3'].map((feature) => (
                <div key={feature} className="flex items-center justify-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-background/10 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-background/80">{t(`auth.signIn.${feature}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
