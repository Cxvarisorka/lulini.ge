import { useState, useMemo } from 'react';
import { Plus, Search, Pencil, Trash2, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useAdmin } from '../../context/AdminContext';
import { CarRentalForm } from '../../components/admin/CarRentalForm';

export function AdminCarRentals() {
  const { cars, deleteCar, updateCar, cityLocations } = useAdmin();
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingCar, setEditingCar] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const filteredCars = useMemo(() => {
    if (!searchQuery.trim()) return cars;
    const query = searchQuery.toLowerCase();
    return cars.filter(car =>
      car.brand.toLowerCase().includes(query) ||
      car.model.toLowerCase().includes(query) ||
      car.category.toLowerCase().includes(query)
    );
  }, [cars, searchQuery]);

  const handleEdit = (car) => {
    setEditingCar(car);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingCar(null);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingCar(null);
  };

  const handleDelete = (id) => {
    deleteCar(id);
    setDeleteConfirm(null);
  };

  const toggleAvailability = (car) => {
    updateCar(car.id, { available: !car.available });
  };

  const getLocationName = (locationId) => {
    const loc = cityLocations.find(l => l.id === locationId);
    return loc?.name || locationId;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Car Rentals</h1>
          <p className="text-muted-foreground mt-1">
            Manage your rental car fleet
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add New Car
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by brand, model, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Cars Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Cars ({filteredCars.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Car</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Category</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Location</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Price/Day</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCars.map(car => (
                  <tr key={car.id} className="border-b last:border-0 hover:bg-secondary/50 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={car.image}
                          alt={`${car.brand} ${car.model}`}
                          className="w-16 h-12 object-cover rounded-lg"
                          onError={(e) => {
                            e.target.src = 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&q=80';
                          }}
                        />
                        <div>
                          <p className="font-medium">{car.brand} {car.model}</p>
                          <p className="text-sm text-muted-foreground">{car.year}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-secondary capitalize">
                        {car.category}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-muted-foreground">
                      {getLocationName(car.locationId)}
                    </td>
                    <td className="py-4 px-4 font-medium">
                      ${car.pricePerDay}
                    </td>
                    <td className="py-4 px-4">
                      <button
                        onClick={() => toggleAvailability(car)}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full transition-colors ${
                          car.available
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {car.available ? (
                          <>
                            <Check className="h-3 w-3" />
                            Available
                          </>
                        ) : (
                          <>
                            <X className="h-3 w-3" />
                            Unavailable
                          </>
                        )}
                      </button>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(car)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {deleteConfirm === car.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(car.id)}
                            >
                              Confirm
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirm(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirm(car.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCars.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      {searchQuery ? 'No cars found matching your search.' : 'No cars in your fleet yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Car Form Modal */}
      {showForm && (
        <CarRentalForm
          car={editingCar}
          onClose={handleCloseForm}
        />
      )}
    </div>
  );
}
