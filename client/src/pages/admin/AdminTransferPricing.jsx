import { useState } from 'react';
import { DollarSign, Car, Users, Briefcase, Crown, Bus, Save, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useAdmin } from '../../context/AdminContext';

const vehicleInfo = {
  economy: { icon: Car, label: 'Economy', description: 'Standard sedan, up to 3 passengers' },
  business: { icon: Briefcase, label: 'Business', description: 'Premium sedan, up to 3 passengers' },
  firstClass: { icon: Crown, label: 'First Class', description: 'Luxury vehicle, up to 3 passengers' },
  van: { icon: Users, label: 'Van', description: 'Spacious van, up to 7 passengers' },
  minibus: { icon: Bus, label: 'Minibus', description: 'Large vehicle, up to 16 passengers' }
};

export function AdminTransferPricing() {
  const { transferPricing, updateTransferPricing, updateVehicleMultiplier, resetPricing } = useAdmin();

  const [localPricing, setLocalPricing] = useState(transferPricing);
  const [hasChanges, setHasChanges] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleBaseChange = (field, value) => {
    setLocalPricing(prev => ({ ...prev, [field]: Number(value) }));
    setHasChanges(true);
    setSaved(false);
  };

  const handleMultiplierChange = (vehicleId, value) => {
    setLocalPricing(prev => ({
      ...prev,
      vehicleMultipliers: {
        ...prev.vehicleMultipliers,
        [vehicleId]: Number(value)
      }
    }));
    setHasChanges(true);
    setSaved(false);
  };

  const handleSave = () => {
    updateTransferPricing({
      baseRatePerKm: localPricing.baseRatePerKm,
      minimumCharge: localPricing.minimumCharge
    });
    Object.entries(localPricing.vehicleMultipliers).forEach(([id, mult]) => {
      updateVehicleMultiplier(id, mult);
    });
    setHasChanges(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    resetPricing();
    setLocalPricing({
      baseRatePerKm: 2,
      minimumCharge: 25,
      vehicleMultipliers: {
        economy: 1,
        business: 1.5,
        firstClass: 2.5,
        van: 1.8,
        minibus: 2.2
      }
    });
    setHasChanges(false);
  };

  // Calculate example prices
  const calculatePrice = (distance, vehicleId) => {
    const basePrice = Math.max(
      localPricing.minimumCharge,
      distance * localPricing.baseRatePerKm
    );
    return Math.round(basePrice * localPricing.vehicleMultipliers[vehicleId]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transfer Pricing</h1>
          <p className="text-muted-foreground mt-1">
            Configure base rates and vehicle multipliers
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to Default
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges}>
            <Save className="mr-2 h-4 w-4" />
            {saved ? 'Saved!' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Base Pricing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Base Pricing
          </CardTitle>
          <CardDescription>
            Set the base rate per kilometer and minimum charge
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="baseRate">Base Rate per Kilometer ($)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="baseRate"
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={localPricing.baseRatePerKm}
                  onChange={(e) => handleBaseChange('baseRatePerKm', e.target.value)}
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This is multiplied by the distance to calculate the base price
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="minCharge">Minimum Charge ($)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="minCharge"
                  type="number"
                  step="1"
                  min="0"
                  value={localPricing.minimumCharge}
                  onChange={(e) => handleBaseChange('minimumCharge', e.target.value)}
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Minimum price even for very short distances
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vehicle Multipliers */}
      <Card>
        <CardHeader>
          <CardTitle>Vehicle Multipliers</CardTitle>
          <CardDescription>
            Set price multipliers for each vehicle type. Base price is multiplied by this value.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(vehicleInfo).map(([vehicleId, info]) => {
              const Icon = info.icon;
              const multiplier = localPricing.vehicleMultipliers[vehicleId] || 1;

              return (
                <div
                  key={vehicleId}
                  className="p-4 border rounded-xl space-y-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h4 className="font-medium">{info.label}</h4>
                      <p className="text-xs text-muted-foreground">{info.description}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`mult-${vehicleId}`}>Multiplier</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`mult-${vehicleId}`}
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="10"
                        value={multiplier}
                        onChange={(e) => handleMultiplierChange(vehicleId, e.target.value)}
                        className="w-24"
                      />
                      <span className="text-muted-foreground">x</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-1">Example (50km trip):</p>
                    <p className="text-lg font-bold">${calculatePrice(50, vehicleId)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Price Calculator Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Price Calculator Preview</CardTitle>
          <CardDescription>
            See how your pricing affects different trip distances
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Distance</th>
                  {Object.entries(vehicleInfo).map(([id, info]) => (
                    <th key={id} className="text-center py-3 px-4 font-medium text-muted-foreground">
                      {info.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[10, 25, 50, 100, 200].map(distance => (
                  <tr key={distance} className="border-b last:border-0">
                    <td className="py-3 px-4 font-medium">{distance} km</td>
                    {Object.keys(vehicleInfo).map(vehicleId => (
                      <td key={vehicleId} className="py-3 px-4 text-center">
                        ${calculatePrice(distance, vehicleId)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Save Notification */}
      {saved && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg animate-in slide-in-from-bottom-2">
          Pricing saved successfully!
        </div>
      )}
    </div>
  );
}
