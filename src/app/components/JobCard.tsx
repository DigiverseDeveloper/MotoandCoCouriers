import type { Job } from '../context/AppContext';
import { StatusBadge } from './StatusBadge';
import { MapPin, Clock, Package as PackageIcon } from 'lucide-react';
import { format } from 'date-fns';

interface JobCardProps {
  job: Job;
  onClick?: () => void;
}

export function JobCard({ job, onClick }: JobCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm text-gray-500">#{job.id}</span>
            <StatusBadge status={job.status} />
          </div>
          <p className="text-xs text-gray-500">{format(new Date(job.createdAt), 'MMM d, yyyy h:mm a')}</p>
        </div>
        <div className="text-right">
          <p className="text-lg text-blue-600">${job.estimatedPrice}</p>
          <p className="text-xs text-gray-500">{job.urgency}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <MapPin className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500">Pickup</p>
            <p className="text-sm text-gray-900 truncate">{job.pickupAddress}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <MapPin className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500">Delivery</p>
            <p className="text-sm text-gray-900 truncate">{job.deliveryAddress}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-1">
            <PackageIcon className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-600">{job.packageSize}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-600">{job.vehicleType}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
