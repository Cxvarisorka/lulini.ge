import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plus, Edit, Trash2, Check, X, User, Car, BarChart3, Camera } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { driverService } from '../../services/driver';
import { useAdmin } from '../../context/AdminContext';
import ErrorBoundary from '../../components/ErrorBoundary';

function AdminDriversContent() {
  const { t } = useTranslation();
  const { socket } = useAdmin();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    licenseNumber: '',
    vehicle: {
      type: 'economy',
      make: '',
      model: '',
      year: new Date().getFullYear(),
      licensePlate: '',
      color: '',
    },
  });
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    fetchDrivers();

    if (socket) {
      socket.on('driver:updated', handleDriverUpdate);
      socket.on('driver:deleted', handleDriverDelete);
      socket.on('driver:statusChanged', handleDriverStatusChange);
    }

    return () => {
      if (socket) {
        socket.off('driver:updated', handleDriverUpdate);
        socket.off('driver:deleted', handleDriverDelete);
        socket.off('driver:statusChanged', handleDriverStatusChange);
      }
    };
  }, [socket]);

  const fetchDrivers = async () => {
    try {
      const response = await driverService.getAll();
      if (response.success && Array.isArray(response.data.drivers)) {
        setDrivers(response.data.drivers);
      } else {
        console.error('Invalid response format:', response);
        setDrivers([]);
      }
    } catch (error) {
      console.error('Error fetching drivers:', error);
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDriverUpdate = (updatedDriver) => {
    setDrivers((prev) =>
      prev.map((driver) => (driver._id === updatedDriver._id ? updatedDriver : driver))
    );
  };

  const handleDriverStatusChange = ({ driverId, status }) => {
    setDrivers((prev) =>
      prev.map((driver) => (driver._id === driverId ? { ...driver, status } : driver))
    );
  };

  const handleDriverDelete = ({ _id }) => {
    setDrivers((prev) => prev.filter((driver) => driver._id !== _id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingDriver) {
        console.log('Updating driver with data:', formData);
        const response = await driverService.update(editingDriver._id, formData);
        console.log('Update response:', response);
        if (response.success) {
          setDrivers((prev) =>
            prev.map((d) => (d._id === editingDriver._id ? response.data.driver : d))
          );
          alert('Driver updated successfully!');
          resetForm();
          setShowModal(false);
        }
      } else {
        console.log('Creating driver with data:', formData);
        const response = await driverService.create(formData);
        console.log('Create response:', response);
        if (response.success) {
          setDrivers((prev) => [response.data.driver, ...prev]);
          alert('Driver created successfully!');
          resetForm();
          setShowModal(false);
        }
      }
    } catch (error) {
      console.error('Error saving driver:', error);
      console.error('Error details:', error.stack);
      alert(error.message || 'Failed to save driver');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (driver) => {
    setEditingDriver(driver);
    setFormData({
      email: driver.user?.email || '',
      password: '',
      firstName: driver.user?.firstName || '',
      lastName: driver.user?.lastName || '',
      phone: driver.phone || '',
      licenseNumber: driver.licenseNumber || '',
      vehicle: driver.vehicle || {
        type: 'economy',
        make: '',
        model: '',
        year: new Date().getFullYear(),
        licensePlate: '',
        color: '',
      },
    });
    setShowModal(true);
  };

  const handleDelete = async (driverId) => {
    if (!confirm('Are you sure you want to delete this driver? This will also delete their user account and set their rides to null.')) return;

    try {
      const response = await driverService.delete(driverId);
      if (response.success) {
        setDrivers((prev) => prev.filter((d) => d._id !== driverId));
        alert('Driver deleted successfully');
      }
    } catch (error) {
      console.error('Error deleting driver:', error);
      alert(error.message || 'Failed to delete driver. Please try again.');
    }
  };

  const toggleActive = async (driver) => {
    try {
      const response = await driverService.update(driver._id, { isActive: !driver.isActive });
      if (response.success) {
        setDrivers((prev) =>
          prev.map((d) => (d._id === driver._id ? response.data.driver : d))
        );
      }
    } catch (error) {
      console.error('Error toggling driver status:', error);
    }
  };

  const handlePhotoUpload = async (driverId, file) => {
    if (!file) return;
    setUploadingPhoto(driverId);
    try {
      const response = await driverService.uploadPhoto(driverId, file);
      if (response.success) {
        setDrivers((prev) =>
          prev.map((d) => (d._id === driverId ? response.data.driver : d))
        );
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert(error.message || 'Failed to upload photo');
    } finally {
      setUploadingPhoto(null);
    }
  };

  const resetForm = () => {
    setEditingDriver(null);
    setFormData({
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      phone: '',
      licenseNumber: '',
      vehicle: {
        type: 'economy',
        make: '',
        model: '',
        year: new Date().getFullYear(),
        licensePlate: '',
        color: '',
      },
    });
  };

  const filteredDrivers = drivers.filter((driver) => {
    if (filterStatus === 'all') return true;
    return driver.status === filterStatus;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'online':
        return 'bg-green-100 text-green-800';
      case 'busy':
        return 'bg-yellow-100 text-yellow-800';
      case 'offline':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{t('admin.drivers')}</h1>
          <p className="text-muted-foreground mt-1">Manage your driver fleet</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Driver
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b">
        {['all', 'online', 'offline', 'busy'].map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 -mb-px capitalize ${
              filterStatus === status
                ? 'border-b-2 border-primary text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {status}
            {status === 'all' && ` (${drivers.length})`}
            {status !== 'all' && ` (${drivers.filter((d) => d.status === status).length})`}
          </button>
        ))}
      </div>

      {/* Drivers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDrivers.map((driver) => {
          // Safety checks for nested properties
          const user = driver.user || {};
          const vehicle = driver.vehicle || {};

          return (
            <div key={driver._id} className="border rounded-lg p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="relative group">
                    {user.profileImage ? (
                      <img
                        src={user.profileImage}
                        alt={`${user.firstName || ''} ${user.lastName || ''}`}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center">
                        <User className="w-6 h-6" />
                      </div>
                    )}
                    <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                      {uploadingPhoto === driver._id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                      ) : (
                        <Camera className="w-4 h-4 text-white" />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handlePhotoUpload(driver._id, e.target.files[0])}
                        disabled={uploadingPhoto === driver._id}
                      />
                    </label>
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      {user.firstName || 'N/A'} {user.lastName || ''}
                    </h3>
                    <p className="text-sm text-muted-foreground">{user.email || 'No email'}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(driver.status)}`}>
                  {driver.status}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Car className="w-4 h-4 text-muted-foreground" />
                  <span>
                    {vehicle.make || 'N/A'} {vehicle.model || ''} {vehicle.year ? `(${vehicle.year})` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">License:</span>
                  <span className="font-mono">{vehicle.licensePlate || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Rating:</span>
                  <span className="font-semibold">
                    {(driver.rating || 0).toFixed(1)} ⭐ ({driver.totalReviews || 0} {driver.totalReviews === 1 ? 'review' : 'reviews'})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Trips:</span>
                  <span className="font-semibold">{driver.totalTrips || 0}</span>
                </div>
              </div>

            <div className="flex gap-2 pt-4 border-t">
              <Link
                to={`/admin/drivers/${driver._id}`}
                className="flex-1 inline-flex items-center justify-center px-3 py-2 border rounded-lg hover:bg-secondary"
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                Activity
              </Link>
              <button
                onClick={() => handleEdit(driver)}
                className="flex-1 inline-flex items-center justify-center px-3 py-2 border rounded-lg hover:bg-secondary"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </button>
              <button
                onClick={() => toggleActive(driver)}
                className={`flex-1 inline-flex items-center justify-center px-3 py-2 border rounded-lg ${
                  driver.isActive ? 'hover:bg-red-50' : 'hover:bg-green-50'
                }`}
              >
                {driver.isActive ? <X className="w-4 h-4 mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                {driver.isActive ? 'Deactivate' : 'Activate'}
              </button>
              <button
                onClick={() => handleDelete(driver._id)}
                className="px-3 py-2 border border-destructive text-destructive rounded-lg hover:bg-destructive hover:text-destructive-foreground"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredDrivers.length === 0 && (
        <div className="text-center py-12">
          <Car className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No drivers found</p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold mb-6">{editingDriver ? 'Edit Driver' : 'Add New Driver'}</h2>

            {/* Photo Upload (only for existing drivers) */}
            {editingDriver && (
              <div className="flex items-center gap-4 mb-6 pb-4 border-b">
                <div className="relative group">
                  {editingDriver.user?.profileImage ? (
                    <img
                      src={editingDriver.user.profileImage}
                      alt="Driver"
                      className="w-20 h-20 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center">
                      <User className="w-10 h-10 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Driver Photo</p>
                  <label className="inline-flex items-center px-3 py-1.5 border rounded-lg hover:bg-secondary cursor-pointer text-sm">
                    {uploadingPhoto === editingDriver._id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Camera className="w-4 h-4 mr-2" />
                        {editingDriver.user?.profileImage ? 'Change Photo' : 'Upload Photo'}
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        handlePhotoUpload(editingDriver._id, e.target.files[0]);
                        // Update editingDriver reference so preview updates
                        const file = e.target.files[0];
                        if (file) {
                          const previewUrl = URL.createObjectURL(file);
                          setEditingDriver((prev) => ({
                            ...prev,
                            user: { ...prev.user, profileImage: previewUrl },
                          }));
                        }
                      }}
                      disabled={uploadingPhoto === editingDriver._id}
                    />
                  </label>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">First Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Email *</label>
                <input
                  type="email"
                  required
                  disabled={!!editingDriver}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg disabled:bg-secondary"
                />
              </div>

              {!editingDriver && (
                <div>
                  <label className="block text-sm font-medium mb-2">Password *</label>
                  <input
                    type="password"
                    required={!editingDriver}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Phone *</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">License Number *</label>
                  <input
                    type="text"
                    required
                    value={formData.licenseNumber}
                    onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <h3 className="font-semibold mt-6 mb-4">Vehicle Information</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Vehicle Type *</label>
                  <select
                    required
                    value={formData.vehicle.type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        vehicle: { ...formData.vehicle, type: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="economy">Economy</option>
                    <option value="comfort">Comfort</option>
                    <option value="business">Business</option>
                    <option value="van">Van</option>
                    <option value="minibus">Minibus</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">License Plate *</label>
                  <input
                    type="text"
                    required
                    value={formData.vehicle.licensePlate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        vehicle: { ...formData.vehicle, licensePlate: e.target.value.toUpperCase() },
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Make *</label>
                  <input
                    type="text"
                    required
                    value={formData.vehicle.make}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        vehicle: { ...formData.vehicle, make: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Model *</label>
                  <input
                    type="text"
                    required
                    value={formData.vehicle.model}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        vehicle: { ...formData.vehicle, model: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Year *</label>
                  <input
                    type="number"
                    required
                    min="2000"
                    max={new Date().getFullYear() + 1}
                    value={formData.vehicle.year}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        vehicle: { ...formData.vehicle, year: parseInt(e.target.value) },
                      })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Color *</label>
                <input
                  type="text"
                  required
                  value={formData.vehicle.color}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      vehicle: { ...formData.vehicle, color: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : editingDriver ? (
                    'Update Driver'
                  ) : (
                    'Create Driver'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDrivers() {
  return (
    <ErrorBoundary>
      <AdminDriversContent />
    </ErrorBoundary>
  );
}
