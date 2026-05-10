import { useParams, useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { ArrowLeft, MapPin, User, Phone, Package, CheckCircle, XCircle } from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';
import { format } from 'date-fns';
import type { JobStatus } from '../../context/AppContext';

export function DriverJobDetails() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { jobs, updateJobStatus, assignDriver, currentUser, isLoading, error } = useApp();

  const job = jobs.find(j => j.id === jobId);

  if (!job) {
    return (
      <div className="max-w-md mx-auto p-4">
        <p>Job not found</p>
      </div>
    );
  }

  const isAssignedToMe = job.driverId === currentUser?.id;
  const canAccept = job.status === 'Pending' || (job.status === 'Assigned' && isAssignedToMe);
  const canPickup = job.status === 'Accepted';
  const canMarkInTransit = job.status === 'Picked Up';
  const canDeliver = job.status === 'In Transit';
  const canViewContacts = isAssignedToMe && ['Accepted', 'Picked Up', 'In Transit', 'Delivered'].includes(job.status);

  const handleStatusUpdate = async (newStatus: JobStatus) => {
    if (newStatus === 'Accepted' && currentUser?.role === 'driver' && !job.driverId) {
      const assigned = await assignDriver(job.id, currentUser.id);
      if (!assigned) return false;
    }

    return updateJobStatus(job.id, newStatus);
  };

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <button
        onClick={() => navigate('/driver')}
        className="flex items-center gap-2 text-green-600 hover:text-green-700"
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

        <div className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl p-4 mb-6">
          <p className="text-sm opacity-80 mb-1">Earnings</p>
          <p className="text-3xl">${job.estimatedPrice}</p>
          <div className="flex items-center gap-4 mt-2 pt-2 border-t border-green-500">
            <div>
              <p className="text-xs opacity-80">Urgency</p>
              <p className="text-sm">{job.urgency}</p>
            </div>
            <div>
              <p className="text-xs opacity-80">Vehicle</p>
              <p className="text-sm">{job.vehicleType}</p>
            </div>
          </div>
        </div>

        {canViewContacts && job.pickupContactName && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-500 mb-2">Booking Contact</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-gray-900">{job.pickupContactName}</p>
                <p className="text-sm text-gray-500">{job.pickupContactPhone}</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-5 h-5 text-green-600" />
              <h3 className="text-gray-900">Pickup</h3>
            </div>
            <div className="pl-7 space-y-2 bg-green-50 rounded-lg p-3 -ml-7">
              <p className="text-sm text-gray-900">{job.pickupAddress}</p>
              {canViewContacts ? (
                <>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <User className="w-4 h-4" />
                    <span>{job.pickupContactName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="w-4 h-4" />
                    <a href={`tel:${job.pickupContactPhone}`} className="text-blue-600">
                      {job.pickupContactPhone}
                    </a>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-600">Contact details available after acceptance.</p>
              )}
              <p className="text-sm text-gray-600">
                Scheduled: {format(new Date(job.pickupTime), 'MMM d, h:mm a')}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-5 h-5 text-red-600" />
              <h3 className="text-gray-900">Delivery</h3>
            </div>
            <div className="pl-7 space-y-2 bg-red-50 rounded-lg p-3 -ml-7">
              <p className="text-sm text-gray-900">{job.deliveryAddress}</p>
              {canViewContacts ? (
                <>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <User className="w-4 h-4" />
                    <span>{job.deliveryContactName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="w-4 h-4" />
                    <a href={`tel:${job.deliveryContactPhone}`} className="text-blue-600">
                      {job.deliveryContactPhone}
                    </a>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-600">Contact details available after acceptance.</p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-5 h-5 text-blue-600" />
              <h3 className="text-gray-900">Package</h3>
            </div>
            <div className="pl-7 space-y-1">
              <p className="text-sm text-gray-900">{job.packageDescription}</p>
              <p className="text-sm text-gray-600">Size: {job.packageSize}</p>
              {job.specialInstructions && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mt-2">
                  <p className="text-xs text-yellow-800">
                    <strong>Special Instructions:</strong> {job.specialInstructions}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t border-gray-200">
          {canAccept && (
            <button
              onClick={() => handleStatusUpdate('Accepted')}
              disabled={isLoading}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg transition flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-5 h-5" />
              Accept Job
            </button>
          )}

          {canPickup && (
            <button
              onClick={() => handleStatusUpdate('Picked Up')}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-70 text-white py-3 rounded-lg transition"
            >
              Mark as Picked Up
            </button>
          )}

          {canMarkInTransit && (
            <button
              onClick={() => handleStatusUpdate('In Transit')}
              disabled={isLoading}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-70 text-white py-3 rounded-lg transition"
            >
              Mark as In Transit
            </button>
          )}

          {canDeliver && (
            <button
              onClick={async () => {
                const ok = await handleStatusUpdate('Delivered');
                if (ok) navigate('/driver');
              }}
              disabled={isLoading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-70 text-white py-3 rounded-lg transition"
            >
              Mark as Delivered
            </button>
          )}

          {(job.status === 'Pending' || job.status === 'Assigned') && (
            <button
              onClick={async () => {
                const ok = await handleStatusUpdate('Cancelled');
                if (ok) navigate('/driver');
              }}
              disabled={isLoading}
              className="w-full bg-red-100 hover:bg-red-200 disabled:opacity-70 text-red-700 py-3 rounded-lg transition flex items-center justify-center gap-2"
            >
              <XCircle className="w-5 h-5" />
              Decline Job
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
