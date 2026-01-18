import { useState, useMemo } from 'react';
import { Plus, Search, Pencil, Trash2, Star, Loader2, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useAdmin } from '../../context/AdminContext';
import { TourForm } from '../../components/admin/TourForm';

export function AdminTours() {
  const { t } = useTranslation();
  const { tours, removeTour, updateTour, loadingTours } = useAdmin();
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTour, setEditingTour] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const filteredTours = useMemo(() => {
    if (!searchQuery.trim()) return tours;
    const query = searchQuery.toLowerCase();
    return tours.filter(tour =>
      tour.name?.toLowerCase().includes(query) ||
      tour.location?.toLowerCase().includes(query) ||
      tour.category?.toLowerCase().includes(query)
    );
  }, [tours, searchQuery]);

  const handleEdit = (tour) => {
    setEditingTour(tour);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingTour(null);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTour(null);
  };

  const handleDelete = async (id) => {
    setActionLoading(id);
    try {
      await removeTour(id);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete tour:', error);
      alert('Failed to delete tour: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleAvailability = async (tour) => {
    const id = tour._id || tour.id;
    setActionLoading(id);
    try {
      await updateTour(id, { available: !tour.available });
    } catch (error) {
      console.error('Failed to update tour:', error);
      alert('Failed to update tour: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleFeatured = async (tour) => {
    const id = tour._id || tour.id;
    setActionLoading(id);
    try {
      await updateTour(id, { featured: !tour.featured });
    } catch (error) {
      console.error('Failed to update tour:', error);
      alert('Failed to update tour: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('admin.tours.title')}</h1>
          <p className="text-muted-foreground mt-1">
            Manage tours and experiences
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" />
          {t('admin.tours.addTour')}
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, location, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tours Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Tours ({filteredTours.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTours ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Tour</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Category</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Duration</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Price</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTours.map(tour => {
                    const tourId = tour._id || tour.id;
                    const isLoading = actionLoading === tourId;
                    return (
                      <tr key={tourId} className="border-b last:border-0 hover:bg-secondary/50 transition-colors">
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={tour.image}
                              alt={tour.name}
                              className="w-20 h-14 object-cover rounded-lg"
                              onError={(e) => {
                                e.target.src = 'https://via.placeholder.com/160x112?text=Tour';
                              }}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{tour.name}</p>
                                {tour.featured && (
                                  <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <MapPin className="w-3 h-3" />
                                {tour.location}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-secondary capitalize">
                            {tour.category}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <p className="text-sm">{tour.duration}</p>
                          <p className="text-xs text-muted-foreground">{tour.minGroupSize}-{tour.maxGroupSize} people</p>
                        </td>
                        <td className="py-4 px-4">
                          <p className="font-semibold">${tour.price}</p>
                          <p className="text-xs text-muted-foreground capitalize">{tour.priceType?.replace('per', '/')}</p>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => toggleAvailability(tour)}
                              disabled={isLoading}
                              className={`inline-flex px-2 py-1 text-xs font-medium rounded-full transition-colors ${
                                tour.available
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                  : 'bg-red-100 text-red-700 hover:bg-red-200'
                              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              {tour.available ? 'Available' : 'Unavailable'}
                            </button>
                            <button
                              onClick={() => toggleFeatured(tour)}
                              disabled={isLoading}
                              className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full transition-colors ${
                                tour.featured
                                  ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <Star className={`w-3 h-3 ${tour.featured ? 'fill-current' : ''}`} />
                              {tour.featured ? 'Featured' : 'Not Featured'}
                            </button>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(tour)}
                              disabled={isLoading}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {deleteConfirm === tourId ? (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(tourId)}
                                  disabled={isLoading}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeleteConfirm(null)}
                                  disabled={isLoading}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirm(tourId)}
                                disabled={isLoading}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredTours.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No tours found</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tour Form Modal */}
      {showForm && (
        <TourForm
          tour={editingTour}
          onClose={handleCloseForm}
        />
      )}
    </div>
  );
}
