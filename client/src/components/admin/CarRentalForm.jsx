import { useState, useRef } from 'react';
import { X, Plus, Upload, Loader2, Image as ImageIcon } from 'lucide-react';
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

  const [formData, setFormData] = useState(() => {
    if (car) {
      return {
        brand: car.brand || '',
        model: car.model || '',
        year: car.year || new Date().getFullYear(),
        category: car.category || 'economy',
        locationId: car.locationId || 'tbilisi',
        pricePerDay: car.pricePerDay || 50,
        deposit: car.deposit || 200,
        mileageLimit: car.mileageLimit || 'unlimited',
        minAge: car.minAge || 21,
        passengers: car.passengers || 5,
        luggage: car.luggage || 3,
        doors: car.doors || 4,
        transmission: car.transmission || 'automatic',
        fuelType: car.fuelType || 'petrol',
        airConditioning: car.airConditioning !== false,
        features: car.features || [],
        description: car.description || '',
        available: car.available !== false,
        existingImages: car.images || []
      };
    }
    return { ...defaultCar, existingImages: [] };
  });

  const [newFeature, setNewFeature] = useState('');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Image upload state
  const [mainImageFile, setMainImageFile] = useState(null);
  const [mainImagePreview, setMainImagePreview] = useState(car?.image || null);
  const [galleryFiles, setGalleryFiles] = useState([]);
  const [galleryPreviews, setGalleryPreviews] = useState([]);

  const mainImageRef = useRef(null);
  const galleryRef = useRef(null);

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

  // Main image upload handler
  const handleMainImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setErrors(prev => ({ ...prev, image: 'Please select an image file' }));
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setErrors(prev => ({ ...prev, image: 'Image must be less than 5MB' }));
        return;
      }
      setMainImageFile(file);
      setMainImagePreview(URL.createObjectURL(file));
      setErrors(prev => ({ ...prev, image: null }));
    }
  };

  // Gallery images upload handler
  const handleGalleryChange = (e) => {
    const files = Array.from(e.target.files);
    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) return false;
      if (file.size > 5 * 1024 * 1024) return false;
      return true;
    });

    if (validFiles.length > 0) {
      setGalleryFiles(prev => [...prev, ...validFiles]);
      const newPreviews = validFiles.map(file => URL.createObjectURL(file));
      setGalleryPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const removeGalleryImage = (index) => {
    URL.revokeObjectURL(galleryPreviews[index]);
    setGalleryFiles(prev => prev.filter((_, i) => i !== index));
    setGalleryPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingImage = (imageUrl) => {
    setFormData(prev => ({
      ...prev,
      existingImages: prev.existingImages.filter(img => img !== imageUrl)
    }));
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

  const validate = () => {
    const newErrors = {};
    if (!formData.brand.trim()) newErrors.brand = 'Brand is required';
    if (!formData.model.trim()) newErrors.model = 'Model is required';
    if (!isEditing && !mainImageFile && !mainImagePreview) {
      newErrors.image = 'Main image is required';
    }
    if (formData.pricePerDay <= 0) newErrors.pricePerDay = 'Price must be greater than 0';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const carData = {
        brand: formData.brand,
        model: formData.model,
        year: formData.year,
        category: formData.category,
        locationId: formData.locationId,
        pricePerDay: formData.pricePerDay,
        deposit: formData.deposit,
        mileageLimit: formData.mileageLimit,
        minAge: formData.minAge,
        passengers: formData.passengers,
        luggage: formData.luggage,
        doors: formData.doors,
        transmission: formData.transmission,
        fuelType: formData.fuelType,
        airConditioning: formData.airConditioning,
        features: formData.features,
        description: formData.description,
        available: formData.available
      };

      if (isEditing) {
        // Include existing images (for keeping/removing)
        carData.images = formData.existingImages;
        await updateCar(car._id || car.id, carData, mainImageFile, galleryFiles);
      } else {
        await addCar(carData, mainImageFile, galleryFiles);
      }
      onClose();
    } catch (error) {
      console.error('Failed to save car:', error);
      setErrors(prev => ({ ...prev, submit: error.message || 'Failed to save car' }));
    } finally {
      setIsSubmitting(false);
    }
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
            disabled={isSubmitting}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errors.submit && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
              {errors.submit}
            </div>
          )}

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
              {/* Main Image Upload */}
              <div className="space-y-2">
                <Label>Main Image *</Label>
                <div className="flex items-start gap-4">
                  <div
                    onClick={() => mainImageRef.current?.click()}
                    className={`relative w-40 h-28 border-2 border-dashed rounded-lg cursor-pointer hover:border-foreground/50 transition-colors flex items-center justify-center overflow-hidden ${
                      errors.image ? 'border-destructive' : 'border-input'
                    }`}
                  >
                    {mainImagePreview ? (
                      <img
                        src={mainImagePreview}
                        alt="Main preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-4">
                        <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Click to upload</p>
                      </div>
                    )}
                    <input
                      ref={mainImageRef}
                      type="file"
                      accept="image/*"
                      onChange={handleMainImageChange}
                      className="hidden"
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>Upload main car image</p>
                    <p>Max 5MB, JPG/PNG/WebP</p>
                  </div>
                </div>
                {errors.image && <p className="text-xs text-destructive">{errors.image}</p>}
              </div>

              {/* Gallery Images Upload */}
              <div className="space-y-2">
                <Label>Gallery Images</Label>
                <div
                  onClick={() => galleryRef.current?.click()}
                  className="border-2 border-dashed border-input rounded-lg p-4 cursor-pointer hover:border-foreground/50 transition-colors text-center"
                >
                  <ImageIcon className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Click to add gallery images</p>
                  <input
                    ref={galleryRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleGalleryChange}
                    className="hidden"
                  />
                </div>

                {/* Existing Gallery Images (when editing) */}
                {formData.existingImages.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Existing images:</p>
                    <div className="flex flex-wrap gap-2">
                      {formData.existingImages.map((img, idx) => (
                        <div key={`existing-${idx}`} className="relative group">
                          <img
                            src={img}
                            alt={`Existing ${idx + 1}`}
                            className="w-20 h-14 object-cover rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => removeExistingImage(img)}
                            className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* New Gallery Previews */}
                {galleryPreviews.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">New images to upload:</p>
                    <div className="flex flex-wrap gap-2">
                      {galleryPreviews.map((preview, idx) => (
                        <div key={`new-${idx}`} className="relative group">
                          <img
                            src={preview}
                            alt={`New ${idx + 1}`}
                            className="w-20 h-14 object-cover rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => removeGalleryImage(idx)}
                            className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
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
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditing ? 'Saving...' : 'Creating...'}
                </>
              ) : (
                isEditing ? 'Save Changes' : 'Add Car'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
