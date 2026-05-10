import { useApp } from '../../context/AppContext';
import { TrendingUp, DollarSign, Package, Truck, Users, Clock, CheckCircle, XCircle } from 'lucide-react';
import { startOfMonth, endOfMonth, format } from 'date-fns';

export function Reports() {
  const { jobs, customers, drivers } = useApp();

  const currentMonth = new Date();
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const monthlyJobs = jobs.filter(j => {
    const createdDate = new Date(j.createdAt);
    return createdDate >= monthStart && createdDate <= monthEnd;
  });

  const completedJobs = jobs.filter(j => j.status === 'Delivered');
  const cancelledJobs = jobs.filter(j => j.status === 'Cancelled');
  const activeJobs = jobs.filter(j => !['Delivered', 'Cancelled'].includes(j.status));

  const totalRevenue = completedJobs.reduce((sum, j) => sum + (j.actualPrice || j.estimatedPrice), 0);
  const monthlyRevenue = monthlyJobs
    .filter(j => j.status === 'Delivered')
    .reduce((sum, j) => sum + (j.actualPrice || j.estimatedPrice), 0);

  const avgJobValue = completedJobs.length > 0
    ? (totalRevenue / completedJobs.length).toFixed(2)
    : '0';

  const completionRate = jobs.length > 0
    ? ((completedJobs.length / jobs.length) * 100).toFixed(1)
    : '0';

  const statusBreakdown = [
    { status: 'Pending', count: jobs.filter(j => j.status === 'Pending').length, color: 'yellow' },
    { status: 'Assigned', count: jobs.filter(j => j.status === 'Assigned').length, color: 'blue' },
    { status: 'In Transit', count: jobs.filter(j => j.status === 'In Transit').length, color: 'orange' },
    { status: 'Delivered', count: completedJobs.length, color: 'green' },
    { status: 'Cancelled', count: cancelledJobs.length, color: 'red' },
  ];

  const vehicleBreakdown = [
    { type: 'Motorcycle', count: jobs.filter(j => j.vehicleType === 'Motorcycle').length },
    { type: 'Van', count: jobs.filter(j => j.vehicleType === 'Van').length },
    { type: 'Truck', count: jobs.filter(j => j.vehicleType === 'Truck').length },
  ];

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">
      <div>
        <h2 className="text-2xl text-gray-900 mb-1">Reports & Analytics</h2>
        <p className="text-sm text-gray-500">{format(monthStart, 'MMMM yyyy')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-4">
          <DollarSign className="w-6 h-6 mb-2 opacity-80" />
          <p className="text-2xl">${monthlyRevenue}</p>
          <p className="text-xs opacity-80">Monthly Revenue</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-4">
          <Package className="w-6 h-6 mb-2 opacity-80" />
          <p className="text-2xl">{monthlyJobs.length}</p>
          <p className="text-xs opacity-80">Monthly Jobs</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-4">
          <TrendingUp className="w-6 h-6 mb-2 opacity-80" />
          <p className="text-2xl">${avgJobValue}</p>
          <p className="text-xs opacity-80">Avg Job Value</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl p-4">
          <CheckCircle className="w-6 h-6 mb-2 opacity-80" />
          <p className="text-2xl">{completionRate}%</p>
          <p className="text-xs opacity-80">Completion Rate</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-md p-6">
        <h3 className="text-lg text-gray-900 mb-4">All-Time Overview</h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <Package className="w-6 h-6 text-purple-600 mx-auto mb-1" />
            <p className="text-2xl text-gray-900">{jobs.length}</p>
            <p className="text-xs text-gray-500">Total Jobs</p>
          </div>
          <div className="text-center">
            <Users className="w-6 h-6 text-blue-600 mx-auto mb-1" />
            <p className="text-2xl text-gray-900">{customers.length}</p>
            <p className="text-xs text-gray-500">Customers</p>
          </div>
          <div className="text-center">
            <Truck className="w-6 h-6 text-green-600 mx-auto mb-1" />
            <p className="text-2xl text-gray-900">{drivers.length}</p>
            <p className="text-xs text-gray-500">Drivers</p>
          </div>
        </div>
        <div className="pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Total Revenue</span>
            <span className="text-xl text-green-600">${totalRevenue}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-md p-6">
        <h3 className="text-lg text-gray-900 mb-4">Job Status Breakdown</h3>
        <div className="space-y-3">
          {statusBreakdown.map(({ status, count, color }) => (
            <div key={status}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-700">{status}</span>
                <span className="text-sm text-gray-900">{count}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-${color}-500`}
                  style={{
                    width: `${jobs.length > 0 ? (count / jobs.length) * 100 : 0}%`,
                    backgroundColor: color === 'yellow' ? '#eab308' :
                      color === 'blue' ? '#3b82f6' :
                      color === 'orange' ? '#f97316' :
                      color === 'green' ? '#22c55e' : '#ef4444',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-md p-6">
        <h3 className="text-lg text-gray-900 mb-4">Vehicle Type Usage</h3>
        <div className="space-y-3">
          {vehicleBreakdown.map(({ type, count }) => (
            <div key={type} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-700">{type}</span>
              </div>
              <span className="text-lg text-gray-900">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-md p-6">
        <h3 className="text-lg text-gray-900 mb-4">Driver Performance</h3>
        <div className="space-y-3">
          {drivers.map(driver => {
            const driverJobs = jobs.filter(j => j.driverId === driver.id);
            const driverCompleted = driverJobs.filter(j => j.status === 'Delivered').length;
            return (
              <div key={driver.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 text-green-700 rounded-full flex items-center justify-center">
                    {driver.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm text-gray-900">{driver.name}</p>
                    <p className="text-xs text-gray-500">Rating {driver.rating}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-900">{driverCompleted}</p>
                  <p className="text-xs text-gray-500">completed</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
