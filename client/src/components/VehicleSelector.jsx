import { useTranslation } from 'react-i18next';
import { Users, Briefcase, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAdmin } from '../context/AdminContext';

const vehicleDefaults = [
  {
    id: 'economy',
    image: 'https://cdn-icons-png.flaticon.com/512/55/55283.png',
    passengers: 3,
    luggage: 2
  },
  {
    id: 'business',
    image: 'https://cdn-icons-png.flaticon.com/512/55/55280.png',
    passengers: 3,
    luggage: 3
  },
  {
    id: 'firstClass',
    image: 'https://cdn-icons-png.flaticon.com/512/55/55274.png',
    passengers: 3,
    luggage: 3
  },
  {
    id: 'van',
    image: 'https://cdn-icons-png.flaticon.com/512/55/55253.png',
    passengers: 7,
    luggage: 7
  },
  {
    id: 'minibus',
    image: 'https://cdn-icons-png.flaticon.com/512/55/55285.png',
    passengers: 16,
    luggage: 16
  }
];

export function VehicleSelector({ selected, onSelect, basePrice = 0 }) {
  const { t } = useTranslation();
  const { transferPricing } = useAdmin();

  // Merge vehicle defaults with dynamic multipliers from context
  const vehicles = vehicleDefaults.map(v => ({
    ...v,
    priceMultiplier: transferPricing.vehicleMultipliers[v.id] || 1
  }));

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{t('vehicles.title')}</h3>
      <div className="grid gap-4">
        {vehicles.map((vehicle) => {
          const isSelected = selected === vehicle.id;
          const price = Math.round(basePrice * vehicle.priceMultiplier);
          const features = t(`vehicles.${vehicle.id}.features`, { returnObjects: true });

          return (
            <button
              key={vehicle.id}
              type="button"
              onClick={() => onSelect(vehicle.id)}
              className={cn(
                "w-full p-4 rounded-lg border-2 transition-all text-left",
                "hover:border-foreground/50",
                isSelected
                  ? "border-foreground bg-secondary/50"
                  : "border-border bg-white"
              )}
            >
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Vehicle Image */}
                <div className="flex-shrink-0 w-full sm:w-40 h-24 bg-secondary rounded-md flex items-center justify-center overflow-hidden">
                  <img
                    src={vehicle.image}
                    alt={t(`vehicles.${vehicle.id}.name`)}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentElement.innerHTML = `
                        <div class="flex items-center justify-center w-full h-full text-muted-foreground">
                          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8c-.3.5-.1 1 .3 1.3.4.2.9.1 1.2-.2l.9-1.1c.2-.3.7-.3.9 0l.3.6c.2.3.5.5.8.5H7c.6 0 1 .4 1 1v2c0 .6-.4 1-1 1H5"/>
                            <circle cx="7" cy="17" r="2"/>
                            <circle cx="17" cy="17" r="2"/>
                          </svg>
                        </div>
                      `;
                    }}
                  />
                </div>

                {/* Vehicle Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-lg">
                        {t(`vehicles.${vehicle.id}.name`)}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {t(`vehicles.${vehicle.id}.description`)}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-foreground flex items-center justify-center">
                        <Check className="w-4 h-4 text-background" />
                      </div>
                    )}
                  </div>

                  {/* Capacity */}
                  <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      <span>{vehicle.passengers}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Briefcase className="w-4 h-4" />
                      <span>{vehicle.luggage}</span>
                    </div>
                  </div>

                  {/* Features */}
                  {Array.isArray(features) && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {features.slice(2).map((feature, index) => (
                        <span
                          key={index}
                          className="text-xs px-2 py-1 bg-secondary rounded-full"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Price */}
                {basePrice > 0 && (
                  <div className="flex-shrink-0 text-right sm:self-center">
                    <p className="text-2xl font-bold">${price}</p>
                    <p className="text-xs text-muted-foreground">total</p>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { vehicleDefaults as vehicles };
