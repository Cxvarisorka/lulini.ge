import { useTranslation } from 'react-i18next';
import { Shield, DollarSign, Headphones, UserCheck } from 'lucide-react';

const features = [
  {
    key: 'safeRides',
    icon: Shield
  },
  {
    key: 'bestPrices',
    icon: DollarSign
  },
  {
    key: 'support',
    icon: Headphones
  },
  {
    key: 'professional',
    icon: UserCheck
  }
];

export function Features() {
  const { t } = useTranslation();

  return (
    <section className="py-16 bg-secondary/30" id="services">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.key}
                className="flex flex-col items-center text-center p-6"
              >
                <div className="w-14 h-14 rounded-full bg-foreground flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-background" />
                </div>
                <h3 className="font-semibold text-lg mb-2">
                  {t(`features.${feature.key}.title`)}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t(`features.${feature.key}.description`)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
