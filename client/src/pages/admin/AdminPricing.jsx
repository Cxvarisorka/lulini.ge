import { useState, useEffect } from 'react';
import { DollarSign, Percent, Save, Loader2, Car } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { settingsService } from '../../services/settings';

export function AdminPricing() {
  const [basePrice, setBasePrice] = useState('');
  const [kmPrice, setKmPrice] = useState('');
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
      const { basePrice: bp, kmPrice: kp, commissionPercent: cp } = response.data;
      setBasePrice(String(bp));
      setKmPrice(String(kp));
      setCommissionPercent(String(cp));
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load pricing settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const bp = parseFloat(basePrice);
    const kp = parseFloat(kmPrice);
    const cp = parseFloat(commissionPercent);

    if (isNaN(bp) || isNaN(kp) || isNaN(cp)) {
      setMessage({ type: 'error', text: 'All fields must be valid numbers' });
      return;
    }
    if (bp < 0 || kp < 0) {
      setMessage({ type: 'error', text: 'Prices cannot be negative' });
      return;
    }
    if (cp < 0 || cp > 100) {
      setMessage({ type: 'error', text: 'Commission must be between 0 and 100' });
      return;
    }

    try {
      setSaving(true);
      setMessage(null);
      await settingsService.updatePricing({
        basePrice: bp,
        kmPrice: kp,
        commissionPercent: cp,
      });
      setMessage({ type: 'success', text: 'Pricing updated successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Failed to update pricing' });
    } finally {
      setSaving(false);
    }
  };

  // Example calculation preview
  const bp = parseFloat(basePrice) || 0;
  const kp = parseFloat(kmPrice) || 0;
  const cp = parseFloat(commissionPercent) || 0;
  const exampleDistance = 10;
  const exampleFare = bp + exampleDistance * kp;
  const exampleCommission = Math.round(exampleFare * (cp / 100) * 100) / 100;
  const exampleDriverPayout = Math.round((exampleFare - exampleCommission) * 100) / 100;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pricing Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure taxi ride pricing and platform commission
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pricing Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Ride Pricing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="basePrice">Base Price (GEL)</Label>
                <Input
                  id="basePrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  placeholder="e.g. 5"
                />
                <p className="text-xs text-muted-foreground">
                  Fixed starting fare for every ride
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="kmPrice">Per KM Price (GEL)</Label>
                <Input
                  id="kmPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={kmPrice}
                  onChange={(e) => setKmPrice(e.target.value)}
                  placeholder="e.g. 1.5"
                />
                <p className="text-xs text-muted-foreground">
                  Additional charge per kilometer
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="commissionPercent">Platform Commission (%)</Label>
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
                  Your percentage from each ride
                </p>
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

              <Button type="submit" disabled={saving} className="w-full">
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Preview Card */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5" />
                Price Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Example: {exampleDistance} km ride (Economy)
              </p>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-muted-foreground">Base fare</span>
                  <span className="font-medium">{bp.toFixed(2)} GEL</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-muted-foreground">
                    Distance ({exampleDistance} km x {kp.toFixed(2)})
                  </span>
                  <span className="font-medium">{(exampleDistance * kp).toFixed(2)} GEL</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm font-medium">Total Fare</span>
                  <span className="font-bold text-lg">{exampleFare.toFixed(2)} GEL</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Percent className="h-3 w-3" />
                    Your commission ({cp}%)
                  </span>
                  <span className="font-medium text-green-600">{exampleCommission.toFixed(2)} GEL</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-muted-foreground">Driver payout</span>
                  <span className="font-medium">{exampleDriverPayout.toFixed(2)} GEL</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vehicle multipliers info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Vehicle Multipliers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Economy</span>
                  <span>1.0x — {exampleFare.toFixed(2)} GEL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Comfort</span>
                  <span>1.5x — {(exampleFare * 1.5).toFixed(2)} GEL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Business</span>
                  <span>2.0x — {(exampleFare * 2).toFixed(2)} GEL</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
