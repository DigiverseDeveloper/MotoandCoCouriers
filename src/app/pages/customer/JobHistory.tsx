import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router';
import { JobCard } from '../../components/JobCard';
import { Filter, Package } from 'lucide-react';
import type { JobStatus } from '../../context/AppContext';

export function JobHistory() {
  const { currentUser, jobs } = useApp();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'All'>('All');

  const myJobs = jobs.filter(j => j.customerId === currentUser?.id);
  const filteredJobs = statusFilter === 'All'
    ? myJobs
    : myJobs.filter(j => j.status === statusFilter);

  const sortedJobs = [...filteredJobs].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const statuses: (JobStatus | 'All')[] = ['All', 'Pending', 'In Transit', 'Delivered', 'Cancelled'];

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <div>
        <h2 className="text-2xl text-gray-900 mb-1">Job History</h2>
        <p className="text-sm text-gray-500">View all your deliveries</p>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-5 h-5 text-gray-600" />
          <h3 className="text-gray-900">Filter by Status</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {statuses.map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-full text-sm transition ${
                statusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm text-gray-500 mb-3">{sortedJobs.length} jobs found</p>
        {sortedJobs.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No jobs found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedJobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                onClick={() => navigate(`/customer/track/${job.id}`)}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
