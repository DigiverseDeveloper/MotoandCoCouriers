import type { JobStatus } from '../context/AppContext';

interface StatusBadgeProps {
  status: JobStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Assigned':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Accepted':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'Picked Up':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'In Transit':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Delivered':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border ${getStatusColor(status)}`}>
      {status}
    </span>
  );
}
