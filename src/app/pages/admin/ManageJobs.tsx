import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { JobCard } from '../../components/JobCard';
import { Filter, Search, UserPlus } from 'lucide-react';
import type { JobStatus } from '../../context/AppContext';

export function ManageJobs() {
  const { jobs, drivers, assignDriver, isLoading, error } = useApp();
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'All'>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  const filteredJobs = jobs.filter(job => {
    const matchesStatus = statusFilter === 'All' || job.status === statusFilter;
    const matchesSearch = searchTerm === '' ||
      job.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.pickupAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.deliveryAddress.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const sortedJobs = [...filteredJobs].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const statuses: (JobStatus | 'All')[] = ['All', 'Pending', 'Assigned', 'In Transit', 'Delivered'];
  const availableDrivers = drivers.filter(d => d.status === 'Available');

  const handleAssignDriver = async (jobId: string, driverId: string) => {
    const ok = await assignDriver(jobId, driverId);
    if (ok) setSelectedJob(null);
  };

  const selectedJobData = selectedJob ? jobs.find(j => j.id === selectedJob) : null;

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <div>
        <h2 className="text-2xl text-gray-900 mb-1">Manage Jobs</h2>
        <p className="text-sm text-gray-500">View and assign deliveries</p>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            placeholder="Search by ID or address..."
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-4 h-4 text-gray-600" />
            <span className="text-sm text-gray-700">Status</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {statuses.map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-full text-sm transition ${
                  statusFilter === status
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm text-gray-500 mb-3">{sortedJobs.length} jobs found</p>
        <div className="space-y-3">
          {sortedJobs.map(job => (
            <div key={job.id} className="relative">
              <JobCard job={job} onClick={() => {}} />
              {job.status === 'Pending' && (
                <button
                  onClick={() => setSelectedJob(job.id)}
                  className="absolute top-3 right-3 bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-lg shadow-md transition"
                >
                  <UserPlus className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {selectedJob && selectedJobData && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-3xl max-w-md w-full p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl text-gray-900 mb-4">Assign Driver to #{selectedJob}</h3>

            {availableDrivers.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800">No available drivers at the moment</p>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                {availableDrivers.map(driver => (
                  <button
                    key={driver.id}
                    onClick={() => handleAssignDriver(selectedJob, driver.id)}
                    disabled={isLoading}
                    className="w-full bg-white border-2 border-gray-200 hover:border-purple-400 disabled:opacity-70 rounded-xl p-4 flex items-center gap-3 transition"
                  >
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <span className="text-lg">{driver.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-gray-900">{driver.name}</p>
                      <p className="text-sm text-gray-500">{driver.vehicleType}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-yellow-600">Rating {driver.rating}</p>
                      <p className="text-xs text-gray-500">{driver.completedJobs} jobs</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setSelectedJob(null)}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-lg transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
