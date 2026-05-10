import { useParams, useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { ArrowLeft, MapPin, User, Phone, Package, Truck, Clock, CheckCircle } from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';
import { format } from 'date-fns';

export function JobTracking() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { jobs, drivers } = useApp();

  const job = jobs.find(j => j.id === jobId);
  const driver = job?.driverId ? drivers.find(d => d.id === job.driverId) : null;

  if (!job) {
    return (
      <div className="max-w-md mx-auto p-4">
        <p>Job not found</p>
      </div>
    );
  }

  const statusSteps = ['Pending', 'Assigned', 'Accepted', 'Picked Up', 'In Transit', 'Delivered'];
  const currentStepIndex = statusSteps.indexOf(job.status);

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <button
        onClick={() => navigate('/customer')}
        className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Dashboard
      </button>

      <div className="bg-white rounded-2xl shadow-md p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl text-gray-900 mb-1">Job #{job.id}</h2>
            <p className="text-sm text-gray-500">{format(new Date(job.createdAt), 'MMM d, yyyy h:mm a')}</p>
          </div>
          <StatusBadge status={job.status} />
        </div>

        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl p-4 mb-6">
          <p className="text-sm opacity-80 mb-1">Estimated Price</p>
          <p className="text-3xl">${job.estimatedPrice}</p>
        </div>

        {driver && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-500 mb-2">Your Driver</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <Truck className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="text-gray-900">{driver.name}</p>
                <p className="text-sm text-gray-500">{driver.vehicleType}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-yellow-600">Rating {driver.rating}</p>
                <p className="text-xs text-gray-500">{driver.completedJobs} jobs</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-5 h-5 text-green-600" />
              <h3 className="text-gray-900">Pickup Location</h3>
            </div>
            <div className="pl-7 space-y-1">
              <p className="text-sm text-gray-900">{job.pickupAddress}</p>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User className="w-4 h-4" />
                <span>{job.pickupContactName}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="w-4 h-4" />
                <span>{job.pickupContactPhone}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="w-4 h-4" />
                <span>{format(new Date(job.pickupTime), 'MMM d, h:mm a')}</span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-5 h-5 text-red-600" />
              <h3 className="text-gray-900">Delivery Location</h3>
            </div>
            <div className="pl-7 space-y-1">
              <p className="text-sm text-gray-900">{job.deliveryAddress}</p>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User className="w-4 h-4" />
                <span>{job.deliveryContactName}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="w-4 h-4" />
                <span>{job.deliveryContactPhone}</span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-5 h-5 text-blue-600" />
              <h3 className="text-gray-900">Package Details</h3>
            </div>
            <div className="pl-7 space-y-1">
              <p className="text-sm text-gray-900">{job.packageDescription}</p>
              <p className="text-sm text-gray-600">Size: {job.packageSize}</p>
              {job.specialInstructions && (
                <p className="text-sm text-gray-600">Note: {job.specialInstructions}</p>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-gray-900 mb-4">Delivery Progress</h3>
          <div className="space-y-3">
            {job.statusHistory.map((history, index) => (
              <div key={index} className="flex gap-3">
                <div className="relative">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-blue-600" />
                  </div>
                  {index < job.statusHistory.length - 1 && (
                    <div className="absolute left-4 top-8 w-0.5 h-6 bg-gray-200" />
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <p className="text-sm text-gray-900">{history.status}</p>
                  <p className="text-xs text-gray-500">{format(new Date(history.timestamp), 'MMM d, h:mm a')}</p>
                  {history.note && <p className="text-xs text-gray-600 mt-1">{history.note}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
