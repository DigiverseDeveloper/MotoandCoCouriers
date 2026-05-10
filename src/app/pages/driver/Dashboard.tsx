import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router';
import { JobCard } from '../../components/JobCard';
import { Package, CheckCircle, TrendingUp, Star } from 'lucide-react';

export function DriverDashboard() {
  const { currentUser, jobs, drivers } = useApp();
  const navigate = useNavigate();

  const driver = drivers.find(d => d.id === currentUser?.id);
  const myJobs = jobs.filter(j => j.driverId === currentUser?.id);
  const activeJobs = myJobs.filter(j => !['Delivered', 'Cancelled'].includes(j.status));
  const completedToday = myJobs.filter(j =>
    j.status === 'Delivered' &&
    new Date(j.updatedAt).toDateString() === new Date().toDateString()
  );

  const availableJobs = jobs.filter(j => j.status === 'Pending');

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">
      <div className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-2xl p-6 shadow-md">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm opacity-80">Driver Status</p>
            <p className="text-2xl">{driver?.status || 'Available'}</p>
          </div>
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
            <Package className="w-6 h-6" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-green-500">
          <div>
            <p className="text-2xl">{activeJobs.length}</p>
            <p className="text-xs opacity-80">Active</p>
          </div>
          <div>
            <p className="text-2xl">{completedToday.length}</p>
            <p className="text-xs opacity-80">Today</p>
          </div>
          <div>
            <p className="text-2xl">{driver?.rating || 0}</p>
            <p className="text-xs opacity-80">Rating</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <Package className="w-6 h-6 text-blue-600 mb-2" />
          <p className="text-2xl text-gray-900">{activeJobs.length}</p>
          <p className="text-xs text-gray-500">Active Jobs</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <CheckCircle className="w-6 h-6 text-green-600 mb-2" />
          <p className="text-2xl text-gray-900">{driver?.completedJobs || 0}</p>
          <p className="text-xs text-gray-500">Completed</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <Star className="w-6 h-6 text-yellow-600 mb-2" />
          <p className="text-2xl text-gray-900">{driver?.rating || 0}</p>
          <p className="text-xs text-gray-500">Rating</p>
        </div>
      </div>

      <div>
        <h3 className="text-lg text-gray-900 mb-3">Your Active Jobs</h3>
        {activeJobs.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-2">No active jobs</p>
            <p className="text-sm text-gray-400">Check available jobs below</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeJobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                onClick={() => navigate(`/driver/job/${job.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-lg text-gray-900 mb-3">Available Jobs</h3>
        {availableJobs.length === 0 ? (
          <div className="bg-white rounded-xl p-6 text-center border border-gray-200">
            <p className="text-sm text-gray-500">No available jobs at the moment</p>
          </div>
        ) : (
          <div className="space-y-3">
            {availableJobs.slice(0, 3).map(job => (
              <JobCard
                key={job.id}
                job={job}
                onClick={() => navigate(`/driver/job/${job.id}`)}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
