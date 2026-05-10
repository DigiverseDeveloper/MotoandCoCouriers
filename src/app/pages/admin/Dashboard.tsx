import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router';
import { Package, Users, Truck, DollarSign, TrendingUp, Clock } from 'lucide-react';
import { JobCard } from '../../components/JobCard';

export function AdminDashboard() {
  const { jobs, customers, drivers } = useApp();
  const navigate = useNavigate();

  const pendingJobs = jobs.filter(j => j.status === 'Pending');
  const activeJobs = jobs.filter(j => !['Delivered', 'Cancelled', 'Pending'].includes(j.status));
  const completedToday = jobs.filter(j =>
    j.status === 'Delivered' &&
    new Date(j.updatedAt).toDateString() === new Date().toDateString()
  );

  const totalRevenue = jobs
    .filter(j => j.status === 'Delivered')
    .reduce((sum, j) => sum + (j.actualPrice || j.estimatedPrice), 0);

  const availableDrivers = drivers.filter(d => d.status === 'Available').length;

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">
      <div>
        <h2 className="text-2xl text-gray-900 mb-1">Admin Dashboard</h2>
        <p className="text-sm text-gray-500">Overview and quick stats</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-4">
          <Package className="w-6 h-6 mb-2 opacity-80" />
          <p className="text-2xl">{pendingJobs.length}</p>
          <p className="text-xs opacity-80">Pending Jobs</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-4">
          <Clock className="w-6 h-6 mb-2 opacity-80" />
          <p className="text-2xl">{activeJobs.length}</p>
          <p className="text-xs opacity-80">Active Jobs</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-4">
          <TrendingUp className="w-6 h-6 mb-2 opacity-80" />
          <p className="text-2xl">{completedToday.length}</p>
          <p className="text-xs opacity-80">Today</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl p-4">
          <DollarSign className="w-6 h-6 mb-2 opacity-80" />
          <p className="text-2xl">${totalRevenue}</p>
          <p className="text-xs opacity-80">Revenue</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => navigate('/admin/jobs')}
          className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md transition"
        >
          <Package className="w-6 h-6 text-purple-600 mb-2 mx-auto" />
          <p className="text-2xl text-gray-900">{jobs.length}</p>
          <p className="text-xs text-gray-500">All Jobs</p>
        </button>
        <button
          onClick={() => navigate('/admin/customers')}
          className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md transition"
        >
          <Users className="w-6 h-6 text-blue-600 mb-2 mx-auto" />
          <p className="text-2xl text-gray-900">{customers.length}</p>
          <p className="text-xs text-gray-500">Customers</p>
        </button>
        <button
          onClick={() => navigate('/admin/drivers')}
          className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md transition"
        >
          <Truck className="w-6 h-6 text-green-600 mb-2 mx-auto" />
          <p className="text-2xl text-gray-900">{availableDrivers}/{drivers.length}</p>
          <p className="text-xs text-gray-500">Available</p>
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg text-gray-900">Pending Jobs</h3>
          <button
            onClick={() => navigate('/admin/jobs')}
            className="text-sm text-purple-600 hover:text-purple-700"
          >
            View All
          </button>
        </div>
        {pendingJobs.length === 0 ? (
          <div className="bg-white rounded-xl p-6 text-center border border-gray-200">
            <p className="text-sm text-gray-500">No pending jobs</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingJobs.slice(0, 3).map(job => (
              <JobCard
                key={job.id}
                job={job}
                onClick={() => navigate('/admin/jobs')}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
