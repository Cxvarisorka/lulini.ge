import { useState, useEffect } from 'react';
import { DollarSign, Percent, Save, Loader2, Car } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { settingsService } from '../../services/settings';

const CATEGORIES = [
  { key: 'economy', label: 'Economy', icon: 'car-outline' },
  { key: 'comfort', label: 'Comfort', icon: 'car' },
  { key: 'business', label: 'Business', icon: 'car-sport' },
  { key: 'van', label: 'Van', icon: 'van' },
  { key: 'minibus', label: 'Minibus', icon: 'bus' },
];

export function AdminPricing() {
  const [categories, setCategories] = useState({});
  const [commissionPercent, setCommissionPercent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadPricing();
  }, []);

  const loadPricing = async () => {
    try {
      setLoading(true);
      const response = await settingsService.getPricing();
      const { commissionPercent: cp, categories: cats } = response.data;
      setCommissionPercent(String(cp));
      const catState = {};
      for (const cat of CATEGORIES) {
        catState[cat.key] = {
          basePrice: String(cats[cat.key]?.basePrice ?? ''),
          kmPrice: String(cats[cat.key]?.kmPrice ?? ''),
        };
      }
      setCategories(catState);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load pricing settings' });
    } finally {
      setLoading(false);
    }
  };

  const updateCategory = (key, field, value) => {
    setCategories(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value }
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const cp = parseFloat(commissionPercent);

    if (isNaN(cp) || cp < 0 || cp > 100) {
      setMessage({ type: 'error', text: 'Commission must be between 0 and 100' });
      return;
    }

    const parsedCategories = {};
    for (const cat of CATEGORIES) {
      const bp = parseFloat(categories[cat.key]?.basePrice);
      const kp = parseFloat(categories[cat.key]?.kmPrice);
      if (isNaN(bp) || isNaN(kp)) {
        setMessage({ type: 'error', text: `All fields must be valid numbers for ${cat.label}` });
        return;
      }
      if (bp < 0 || kp < 0) {
        setMessage({ type: 'error', text: `Prices cannot be negative for ${cat.label}` });
        return;
      }
      parsedCategories[cat.key] = { basePrice: bp, kmPrice: kp };
    }

    try {
      setSaving(true);
      setMessage(null);
      await settingsService.updatePricing({
        commissionPercent: cp,
        categories: parsedCategories,
      });
      setMessage({ type: 'success', text: 'Pricing updated successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Failed to update pricing' });
    } finally {
      setSaving(false);
    }
  };

  // Preview calculation
  const cp = parseFloat(commissionPercent) || 0;
  const exampleDistance = 10;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pricing Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure per-category pricing and platform commission
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Commission */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5" />
              Platform Commission
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-xs space-y-2">
              <Label htmlFor="commissionPercent">Commission (%)</Label>
              <Input
                id="commissionPercent"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={commissionPercent}
                onChange={(e) => setCommissionPercent(e.target.value)}
                placeholder="e.g. 15"
              />
              <p className="text-xs text-muted-foreground">
                Your percentage from each ride across all categories
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Category Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {CATEGORIES.map((cat) => {
            const bp = parseFloat(categories[cat.key]?.basePrice) || 0;
            const kp = parseFloat(categories[cat.key]?.kmPrice) || 0;
            const fare = bp + exampleDistance * kp;
            const commission = Math.round(fare * (cp / 100) * 100) / 100;

            return (
              <Card key={cat.key}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Car className="h-5 w-5" />
                    {cat.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${cat.key}-basePrice`}>Base Price (GEL)</Label>
                    <Input
                      id={`${cat.key}-basePrice`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={categories[cat.key]?.basePrice ?? ''}
                      onChange={(e) => updateCategory(cat.key, 'basePrice', e.target.value)}
                      placeholder="e.g. 5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${cat.key}-kmPrice`}>Per KM Price (GEL)</Label>
                    <Input
                      id={`${cat.key}-kmPrice`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={categories[cat.key]?.kmPrice ?? ''}
                      onChange={(e) => updateCategory(cat.key, 'kmPrice', e.target.value)}
                      placeholder="e.g. 1.5"
                    />
                  </div>

                  {/* Mini preview */}
                  <div className="pt-3 border-t space-y-1 text-sm">
                    <p className="text-muted-foreground">Preview: {exampleDistance} km ride</p>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fare</span>
                      <span className="font-medium">{fare.toFixed(2)} GEL</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Commission ({cp}%)</span>
                      <span className="font-medium text-green-600">{commission.toFixed(2)} GEL</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Driver payout</span>
                      <span className="font-medium">{(fare - commission).toFixed(2)} GEL</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {message && (
          <div
            className={`p-3 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        <Button type="submit" disabled={saving} className="w-full sm:w-auto">
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {saving ? 'Saving...' : 'Save All Changes'}
        </Button>
      </form>
    </div>
  );
}
