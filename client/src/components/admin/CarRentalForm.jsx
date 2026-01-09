import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useAdmin } from '../../context/AdminContext';

const defaultCar = {
  brand: '',
  model: '',
  year: new Date().getFullYear(),
  category: 'economy',
  locationId: 'tbilisi',
  image: '',
  images: [],
  pricePerDay: 50,
  deposit: 200,
  mileageLimit: 'unlimited',
  minAge: 21,
  passengers: 5,
  luggage: 3,
  doors: 4,
  transmission: 'automatic',
  fuelType: 'petrol',
  airConditioning: true,
  features: [],
  description: '',
  available: true
};

export function CarRentalForm({ car, onClose }) {
  const { addCar, updateCar, categories, cityLocations } = useAdmin();
  const isEditing = !!car;

  const [formData, setFormData] = useState(car || defaultCar);
  const [newFeature, setNewFeature] = useState('');
  const [newImage, setNewImage] = useState('');
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const addFeature = () => {
    if (newFeature.trim() && !formData.features.includes(newFeature.trim())) {
      setFormData(prev => ({
        ...prev,
        features: [...prev.features, newFeature.trim()]
      }));
      setNewFeature('');
    }
  };

  const removeFeature = (feature) => {
    setFormData(prev => ({
      ...prev,
      features: prev.features.filter(f => f !== feature)
    }));
  };

  const addImage = () => {
    if (newImage.trim() && !formData.images.includes(newImage.trim())) {
      setFormData(prev => ({
        ...prev,
        images: [...prev.images, newImage.trim()]
      }));
      setNewImage('');
    }
  };

  const removeImage = (image) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter(i => i !== image)
    }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.brand.trim()) newErrors.brand = 'Brand is required';
    if (!formData.model.trim()) newErrors.model = 'Model is required';
    if (!formData.image.trim()) newErrors.image = 'Main image URL is required';
    if (formData.pricePerDay <= 0) newErrors.pricePerDay = 'Price must be greater than 0';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    if (isEditing) {
      updateCar(car.id, formData);
    } else {
      addCar(formData);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-background rounded-2xl w-full max-w-3xl my-8 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">
            {isEditing ? 'Edit Car' : 'Add New Car'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info */}
          <div>
            <h3 className="font-semibold mb-4">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="brand">Brand *</Label>
                <Input
                  id="brand"
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  placeholder="e.g., Toyota"
                  className={errors.brand ? 'border-destructive' : ''}
                />
                {errors.brand && <p className="text-xs text-destructive">{errors.brand}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model *</Label>
                <Input
                  id="model"
                  name="model"
                  value={formData.model}
                  onChange={handleChange}
                  placeholder="e.g., Corolla"
                  className={errors.model ? 'border-destructive' : ''}
                />
                {errors.model && <p className="text-xs text-destructive">{errors.model}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  name="year"
                  type="number"
                  value={formData.year}
                  onChange={handleChange}
                  min={2000}
                  max={new Date().getFullYear() + 1}
                />
              </div>
            </div>
          </div>

          {/* Category & Location */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="locationId">Pickup Location</Label>
              <select
                id="locationId"
                name="locationId"
                value={formData.locationId}
                onChange={handleChange}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                {cityLocations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Pricing */}
          <div>
            <h3 className="font-semibold mb-4">Pricing & Terms</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pricePerDay">Price/Day ($) *</Label>
                <Input
                  id="pricePerDay"
                  name="pricePerDay"
                  type="number"
                  value={formData.pricePerDay}
                  onChange={handleChange}
                  min={1}
                  className={errors.pricePerDay ? 'border-destructive' : ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deposit">Deposit ($)</Label>
                <Input
                  id="deposit"
                  name="deposit"
                  type="number"
                  value={formData.deposit}
                  onChange={handleChange}
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mileageLimit">Mileage Limit</Label>
                <Input
                  id="mileageLimit"
                  name="mileageLimit"
                  value={formData.mileageLimit}
                  onChange={handleChange}
                  placeholder="unlimited"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minAge">Min Age</Label>
                <Input
                  id="minAge"
                  name="minAge"
                  type="number"
                  value={formData.minAge}
                  onChange={handleChange}
                  min={18}
                  max={30}
                />
              </div>
            </div>
          </div>

          {/* Specifications */}
          <div>
            <h3 className="font-semibold mb-4">Specifications</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="space-y-2">
                <Label htmlFor="passengers">Passengers</Label>
                <Input
                  id="passengers"
                  name="passengers"
                  type="number"
                  value={formData.passengers}
                  onChange={handleChange}
                  min={1}
                  max={16}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="luggage">Luggage</Label>
                <Input
                  id="luggage"
                  name="luggage"
                  type="number"
                  value={formData.luggage}
                  onChange={handleChange}
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doors">Doors</Label>
                <Input
                  id="doors"
                  name="doors"
                  type="number"
                  value={formData.doors}
                  onChange={handleChange}
                  min={2}
                  max={5}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transmission">Transmission</Label>
                <select
                  id="transmission"
                  name="transmission"
                  value={formData.transmission}
                  onChange={handleChange}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="automatic">Automatic</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fuelType">Fuel Type</Label>
                <select
                  id="fuelType"
                  name="fuelType"
                  value={formData.fuelType}
                  onChange={handleChange}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="petrol">Petrol</option>
                  <option value="diesel">Diesel</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="electric">Electric</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Air Conditioning</Label>
                <div className="flex items-center h-10">
                  <input
                    type="checkbox"
                    id="airConditioning"
                    name="airConditioning"
                    checked={formData.airConditioning}
                    onChange={handleChange}
                    className="h-4 w-4 rounded border-input"
                  />
                  <label htmlFor="airConditioning" className="ml-2 text-sm">A/C</label>
                </div>
              </div>
            </div>
          </div>

          {/* Images */}
          <div>
            <h3 className="font-semibold mb-4">Images</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="image">Main Image URL *</Label>
                <Input
                  id="image"
                  name="image"
                  value={formData.image}
                  onChange={handleChange}
                  placeholder="https://..."
                  className={errors.image ? 'border-destructive' : ''}
                />
                {errors.image && <p className="text-xs text-destructive">{errors.image}</p>}
              </div>

              <div className="space-y-2">
                <Label>Gallery Images</Label>
                <div className="flex gap-2">
                  <Input
                    value={newImage}
                    onChange={(e) => setNewImage(e.target.value)}
                    placeholder="Add image URL..."
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addImage())}
                  />
                  <Button type="button" variant="outline" onClick={addImage}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {formData.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.images.map((img, idx) => (
                      <div key={idx} className="relative group">
                        <img
                          src={img}
                          alt={`Gallery ${idx + 1}`}
                          className="w-20 h-14 object-cover rounded-lg"
                          onError={(e) => {
                            e.target.src = 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&q=80';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(img)}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Features */}
          <div>
            <h3 className="font-semibold mb-4">Features</h3>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={newFeature}
                  onChange={(e) => setNewFeature(e.target.value)}
                  placeholder="Add feature (e.g., Bluetooth, Cruise Control)..."
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                />
                <Button type="button" variant="outline" onClick={addFeature}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {formData.features.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.features.map((feature, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-secondary rounded-full text-sm"
                    >
                      {feature}
                      <button
                        type="button"
                        onClick={() => removeFeature(feature)}
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              placeholder="Describe the car..."
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none"
            />
          </div>

          {/* Availability */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="available"
              name="available"
              checked={formData.available}
              onChange={handleChange}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="available" className="font-normal">
              Available for rental
            </Label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {isEditing ? 'Save Changes' : 'Add Car'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
