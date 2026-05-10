import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router';
import { JobCard } from '../../components/JobCard';
import { Package, TrendingUp, Clock } from 'lucide-react';

export function CustomerDashboard() {
  const { currentUser, jobs } = useApp();
  const navigate = useNavigate();

  const myJobs = jobs.filter(j => j.customerId === currentUser?.id);
  const activeJobs = myJobs.filter(j => !['Delivered', 'Cancelled'].includes(j.status));
  const completedJobs = myJobs.filter(j => j.status === 'Delivered');

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">
      <div>
        <h2 className="text-2xl text-gray-900 mb-1">Welcome back!</h2>
        <p className="text-sm text-gray-500">Track and manage your deliveries</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-4">
          <Package className="w-6 h-6 mb-2 opacity-80" />
          <p className="text-2xl">{activeJobs.length}</p>
          <p className="text-xs opacity-80">Active</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-4">
          <TrendingUp className="w-6 h-6 mb-2 opacity-80" />
          <p className="text-2xl">{completedJobs.length}</p>
          <p className="text-xs opacity-80">Completed</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl p-4">
          <Clock className="w-6 h-6 mb-2 opacity-80" />
          <p className="text-2xl">{myJobs.length}</p>
          <p className="text-xs opacity-80">Total</p>
        </div>
      </div>

      <div>
        <h3 className="text-lg text-gray-900 mb-3">Active Deliveries</h3>
        {activeJobs.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">No active deliveries</p>
            <button
              onClick={() => navigate('/customer/create-job')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition"
            >
              Create New Job
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {activeJobs.map(job => (
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
