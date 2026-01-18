import { useState, useEffect } from 'react';
import { X, Loader2, Upload, Trash2, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useAdmin } from '../../context/AdminContext';

const tourCategories = ['cultural', 'adventure', 'nature', 'wine', 'food', 'historical', 'religious', 'mountain', 'city'];
const difficultyLevels = ['easy', 'moderate', 'challenging'];
const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const commonLanguages = ['English', 'Georgian', 'Russian', 'Spanish', 'French', 'German'];

export function TourForm({ tour, onClose }) {
  const { addTour, updateTour } = useAdmin();
  const isEditing = !!tour;

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    shortDescription: '',
    duration: '',
    category: 'cultural',
    price: '',
    priceType: 'perPerson',
    maxGroupSize: 15,
    minGroupSize: 1,
    meetingPoint: '',
    location: '',
    difficulty: 'easy',
    requirements: '',
    cancellationPolicy: 'Free cancellation up to 24 hours before the tour',
    available: true,
    featured: false,
    includes: [''],
    excludes: [''],
    itinerary: [{ time: '', title: '', description: '' }],
    availableDays: [...daysOfWeek],
    languages: ['English']
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [galleryFiles, setGalleryFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (tour) {
      setFormData({
        name: tour.name || '',
        description: tour.description || '',
        shortDescription: tour.shortDescription || '',
        duration: tour.duration || '',
        category: tour.category || 'cultural',
        price: tour.price || '',
        priceType: tour.priceType || 'perPerson',
        maxGroupSize: tour.maxGroupSize || 15,
        minGroupSize: tour.minGroupSize || 1,
        meetingPoint: tour.meetingPoint || '',
        location: tour.location || '',
        difficulty: tour.difficulty || 'easy',
        requirements: tour.requirements || '',
        cancellationPolicy: tour.cancellationPolicy || 'Free cancellation up to 24 hours before the tour',
        available: tour.available !== undefined ? tour.available : true,
        featured: tour.featured || false,
        includes: tour.includes && tour.includes.length > 0 ? tour.includes : [''],
        excludes: tour.excludes && tour.excludes.length > 0 ? tour.excludes : [''],
        itinerary: tour.itinerary && tour.itinerary.length > 0 ? tour.itinerary : [{ time: '', title: '', description: '' }],
        availableDays: tour.availableDays || [...daysOfWeek],
        languages: tour.languages || ['English']
      });
      if (tour.image) {
        setImagePreview(tour.image);
      }
    }
  }, [tour]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleGalleryChange = (e) => {
    const files = Array.from(e.target.files);
    setGalleryFiles(prev => [...prev, ...files]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Filter out empty strings from arrays
      const cleanedData = {
        ...formData,
        includes: formData.includes.filter(item => item.trim() !== ''),
        excludes: formData.excludes.filter(item => item.trim() !== ''),
        itinerary: formData.itinerary.filter(item => item.title.trim() !== ''),
        price: parseFloat(formData.price)
      };

      if (isEditing) {
        await updateTour(tour._id, cleanedData, imageFile, galleryFiles);
      } else {
        await addTour(cleanedData, imageFile, galleryFiles);
      }
      onClose();
    } catch (err) {
      console.error('Error submitting tour:', err);
      setError(err.message || 'Failed to save tour');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addArrayItem = (field) => {
    setFormData(prev => ({
      ...prev,
      [field]: [...prev[field], '']
    }));
  };

  const removeArrayItem = (field, index) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index)
    }));
  };

  const updateArrayItem = (field, index, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].map((item, i) => i === index ? value : item)
    }));
  };

  const addItineraryItem = () => {
    setFormData(prev => ({
      ...prev,
      itinerary: [...prev.itinerary, { time: '', title: '', description: '' }]
    }));
  };

  const removeItineraryItem = (index) => {
    setFormData(prev => ({
      ...prev,
      itinerary: prev.itinerary.filter((_, i) => i !== index)
    }));
  };

  const updateItineraryItem = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      itinerary: prev.itinerary.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const toggleDay = (day) => {
    setFormData(prev => ({
      ...prev,
      availableDays: prev.availableDays.includes(day)
        ? prev.availableDays.filter(d => d !== day)
        : [...prev.availableDays, day]
    }));
  };

  const toggleLanguage = (language) => {
    setFormData(prev => ({
      ...prev,
      languages: prev.languages.includes(language)
        ? prev.languages.filter(l => l !== language)
        : [...prev.languages, language]
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl w-full max-w-4xl my-8">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white rounded-t-xl">
          <h2 className="text-2xl font-bold">{isEditing ? 'Edit Tour' : 'Add New Tour'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Basic Information</h3>

            <div>
              <Label htmlFor="name">Tour Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="shortDescription">Short Description *</Label>
              <Input
                id="shortDescription"
                value={formData.shortDescription}
                onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Full Description *</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20"
                rows={4}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Category *</Label>
                <select
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  required
                >
                  {tourCategories.map(cat => (
                    <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="difficulty">Difficulty *</Label>
                <select
                  id="difficulty"
                  value={formData.difficulty}
                  onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  required
                >
                  {difficultyLevels.map(level => (
                    <option key={level} value={level}>{level.charAt(0).toUpperCase() + level.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="duration">Duration *</Label>
                <Input
                  id="duration"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  placeholder="e.g., 1 day, 3 hours"
                  required
                />
              </div>

              <div>
                <Label htmlFor="location">Location *</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="meetingPoint">Meeting Point *</Label>
              <Input
                id="meetingPoint"
                value={formData.meetingPoint}
                onChange={(e) => setFormData({ ...formData, meetingPoint: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Pricing */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Pricing & Group Size</h3>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="price">Price *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="priceType">Price Type *</Label>
                <select
                  id="priceType"
                  value={formData.priceType}
                  onChange={(e) => setFormData({ ...formData, priceType: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20"
                >
                  <option value="perPerson">Per Person</option>
                  <option value="perGroup">Per Group</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="minGroupSize">Min Group Size *</Label>
                <Input
                  id="minGroupSize"
                  type="number"
                  min="1"
                  value={formData.minGroupSize}
                  onChange={(e) => setFormData({ ...formData, minGroupSize: parseInt(e.target.value) })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="maxGroupSize">Max Group Size *</Label>
                <Input
                  id="maxGroupSize"
                  type="number"
                  min="1"
                  value={formData.maxGroupSize}
                  onChange={(e) => setFormData({ ...formData, maxGroupSize: parseInt(e.target.value) })}
                  required
                />
              </div>
            </div>
          </div>

          {/* Languages */}
          <div className="space-y-2">
            <Label>Languages Offered</Label>
            <div className="flex flex-wrap gap-2">
              {commonLanguages.map(lang => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => toggleLanguage(lang)}
                  className={`px-3 py-1 rounded-full text-sm ${
                    formData.languages.includes(lang)
                      ? 'bg-foreground text-background'
                      : 'bg-secondary text-foreground'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {/* Available Days */}
          <div className="space-y-2">
            <Label>Available Days</Label>
            <div className="flex flex-wrap gap-2">
              {daysOfWeek.map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-3 py-1 rounded-full text-sm capitalize ${
                    formData.availableDays.includes(day)
                      ? 'bg-foreground text-background'
                      : 'bg-secondary text-foreground'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          {/* What's Included */}
          <div className="space-y-2">
            <Label>What's Included</Label>
            {formData.includes.map((item, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={item}
                  onChange={(e) => updateArrayItem('includes', index, e.target.value)}
                  placeholder="e.g., Professional guide"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeArrayItem('includes', index)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => addArrayItem('includes')}>
              <Plus className="w-4 h-4 mr-1" /> Add Item
            </Button>
          </div>

          {/* What's Excluded */}
          <div className="space-y-2">
            <Label>What's Excluded</Label>
            {formData.excludes.map((item, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={item}
                  onChange={(e) => updateArrayItem('excludes', index, e.target.value)}
                  placeholder="e.g., Personal expenses"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeArrayItem('excludes', index)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => addArrayItem('excludes')}>
              <Plus className="w-4 h-4 mr-1" /> Add Item
            </Button>
          </div>

          {/* Additional Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="requirements">Requirements</Label>
              <textarea
                id="requirements"
                value={formData.requirements}
                onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20"
                rows={2}
                placeholder="e.g., Moderate fitness level required"
              />
            </div>

            <div>
              <Label htmlFor="cancellationPolicy">Cancellation Policy</Label>
              <Input
                id="cancellationPolicy"
                value={formData.cancellationPolicy}
                onChange={(e) => setFormData({ ...formData, cancellationPolicy: e.target.value })}
              />
            </div>
          </div>

          {/* Images */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Images</h3>

            <div>
              <Label htmlFor="mainImage">Main Image *</Label>
              {imagePreview && (
                <img src={imagePreview} alt="Preview" className="w-full h-48 object-cover rounded-lg mb-2" />
              )}
              <Input
                id="mainImage"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                required={!isEditing}
              />
            </div>

            <div>
              <Label htmlFor="gallery">Gallery Images</Label>
              <Input
                id="gallery"
                type="file"
                accept="image/*"
                multiple
                onChange={handleGalleryChange}
              />
              {galleryFiles.length > 0 && (
                <p className="text-sm text-muted-foreground mt-1">
                  {galleryFiles.length} file(s) selected
                </p>
              )}
            </div>
          </div>

          {/* Status Toggles */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.available}
                onChange={(e) => setFormData({ ...formData, available: e.target.checked })}
                className="w-4 h-4"
              />
              <span>Available for Booking</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.featured}
                onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                className="w-4 h-4"
              />
              <span>Featured Tour</span>
            </label>
          </div>

          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-lg">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isEditing ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                isEditing ? 'Update Tour' : 'Create Tour'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
