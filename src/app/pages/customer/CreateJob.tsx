import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { MapPin, User, Phone, Package, FileText, Truck, Clock, DollarSign, ArrowRight } from 'lucide-react';
import type { PackageSize, VehicleType } from '../../context/AppContext';

export function CreateJob() {
  const navigate = useNavigate();
  const { currentUser, addJob, isLoading, error } = useApp();
  const [step, setStep] = useState(1);

  const initialFormData = {
    pickupAddress: '',
    pickupContactName: '',
    pickupContactPhone: '',
    pickupTime: '',
    deliveryAddress: '',
    deliveryContactName: '',
    deliveryContactPhone: '',
    packageSize: 'Medium' as PackageSize,
    packageDescription: '',
    specialInstructions: '',
    vehicleType: 'Motorcycle' as VehicleType,
    urgency: 'Standard' as 'Standard' | 'Express' | 'Same Day',
  };

  const [formData, setFormData] = useState(initialFormData);

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const calculatePrice = () => {
    let basePrice = 20;

    if (formData.packageSize === 'Medium') basePrice += 10;
    if (formData.packageSize === 'Large') basePrice += 20;
    if (formData.packageSize === 'Extra Large') basePrice += 35;

    if (formData.vehicleType === 'Van') basePrice += 15;
    if (formData.vehicleType === 'Truck') basePrice += 40;

    if (formData.urgency === 'Express') basePrice += 15;
    if (formData.urgency === 'Same Day') basePrice += 10;

    return basePrice;
  };

  const handleSubmit = async () => {
    if (!currentUser) return;

    const ok = await addJob({
      customerId: currentUser.id,
      status: 'Pending',
      pickupAddress: formData.pickupAddress,
      pickupContactName: formData.pickupContactName,
      pickupContactPhone: formData.pickupContactPhone,
      pickupTime: formData.pickupTime,
      deliveryAddress: formData.deliveryAddress,
      deliveryContactName: formData.deliveryContactName,
      deliveryContactPhone: formData.deliveryContactPhone,
      packageSize: formData.packageSize,
      packageDescription: formData.packageDescription,
      specialInstructions: formData.specialInstructions,
      vehicleType: formData.vehicleType,
      urgency: formData.urgency,
      estimatedPrice: calculatePrice(),
    });

    if (ok) {
      setFormData(initialFormData);
      navigate('/customer');
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-lg text-gray-900">Pickup Details</h3>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Pickup Address</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={formData.pickupAddress}
                  onChange={(e) => updateField('pickupAddress', e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="123 Collins St, Melbourne VIC 3000"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Contact Name</label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={formData.pickupContactName}
                  onChange={(e) => updateField('pickupContactName', e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="John Smith"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Contact Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="tel"
                  value={formData.pickupContactPhone}
                  onChange={(e) => updateField('pickupContactPhone', e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0412 345 678"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Preferred Pickup Time</label>
              <div className="relative">
                <Clock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="datetime-local"
                  value={formData.pickupTime}
                  onChange={(e) => updateField('pickupTime', e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg text-gray-900">Delivery Details</h3>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Delivery Address</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={formData.deliveryAddress}
                  onChange={(e) => updateField('deliveryAddress', e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="456 Burke St, Melbourne VIC 3000"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Contact Name</label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={formData.deliveryContactName}
                  onChange={(e) => updateField('deliveryContactName', e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Jane Doe"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Contact Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="tel"
                  value={formData.deliveryContactPhone}
                  onChange={(e) => updateField('deliveryContactPhone', e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0423 456 789"
                  required
                />
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg text-gray-900">Package Details</h3>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Package Size</label>
              <div className="grid grid-cols-2 gap-2">
                {(['Small', 'Medium', 'Large', 'Extra Large'] as PackageSize[]).map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => updateField('packageSize', size)}
                    className={`p-3 rounded-lg border-2 transition ${
                      formData.packageSize === size
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Package Description</label>
              <div className="relative">
                <Package className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={formData.packageDescription}
                  onChange={(e) => updateField('packageDescription', e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Documents, office supplies, etc."
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Special Instructions (Optional)</label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <textarea
                  value={formData.specialInstructions}
                  onChange={(e) => updateField('specialInstructions', e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Any special handling requirements..."
                />
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-lg text-gray-900">Service & Pricing</h3>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Vehicle Type</label>
              <div className="space-y-2">
                {(['Motorcycle', 'Van', 'Truck'] as VehicleType[]).map(vehicle => (
                  <button
                    key={vehicle}
                    type="button"
                    onClick={() => updateField('vehicleType', vehicle)}
                    className={`w-full p-4 rounded-lg border-2 transition flex items-center gap-3 ${
                      formData.vehicleType === vehicle
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Truck className="w-5 h-5 text-gray-600" />
                    <div className="flex-1 text-left">
                      <p className="text-sm text-gray-900">{vehicle}</p>
                      <p className="text-xs text-gray-500">
                        {vehicle === 'Motorcycle' && 'Small packages, fast delivery'}
                        {vehicle === 'Van' && 'Medium to large packages'}
                        {vehicle === 'Truck' && 'Extra large or heavy items'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Urgency</label>
              <div className="space-y-2">
                {(['Standard', 'Same Day', 'Express'] as const).map(urgency => (
                  <button
                    key={urgency}
                    type="button"
                    onClick={() => updateField('urgency', urgency)}
                    className={`w-full p-3 rounded-lg border-2 transition ${
                      formData.urgency === urgency
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {urgency}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl p-6 mt-6">
              <div className="flex items-center justify-between mb-2">
                <span>Estimated Price</span>
                <DollarSign className="w-5 h-5" />
              </div>
              <p className="text-3xl">${calculatePrice()}</p>
              <p className="text-sm text-blue-100 mt-1">Final price may vary</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          {[1, 2, 3, 4].map(s => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full transition ${
                s <= step ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
        <p className="text-sm text-gray-500">Step {step} of 4</p>
      </div>

      <div className="bg-white rounded-2xl shadow-md p-6 mb-4">
        {renderStep()}
      </div>

      <div className="flex gap-3">
        {step > 1 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-lg transition"
          >
            Back
          </button>
        )}
        <button
          onClick={() => {
            if (step === 4) {
              handleSubmit();
            } else {
              setStep(step + 1);
            }
          }}
          disabled={isLoading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-70 text-white py-3 rounded-lg transition flex items-center justify-center gap-2"
        >
          {step === 4 ? (isLoading ? 'Confirming...' : 'Confirm Booking') : 'Continue'}
          {step < 4 && <ArrowRight className="w-5 h-5" />}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
