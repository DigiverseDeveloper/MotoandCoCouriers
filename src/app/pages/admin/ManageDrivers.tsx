import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Search, Mail, Phone, Truck, Star, Package, Filter } from 'lucide-react';

export function ManageDrivers() {
  const { drivers, jobs } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Available' | 'Busy' | 'Offline'>('All');

  const filteredDrivers = drivers.filter(driver => {
    const matchesSearch = driver.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.phone.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || driver.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getDriverActiveJobs = (driverId: string) => {
    return jobs.filter(j => j.driverId === driverId && !['Delivered', 'Cancelled'].includes(j.status)).length;
  };

  const statuses: ('All' | 'Available' | 'Busy' | 'Offline')[] = ['All', 'Available', 'Busy', 'Offline'];

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <div>
        <h2 className="text-2xl text-gray-900 mb-1">Manage Drivers</h2>
        <p className="text-sm text-gray-500">View driver information</p>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            placeholder="Search drivers..."
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
        <p className="text-sm text-gray-500 mb-3">{filteredDrivers.length} drivers found</p>
        <div className="space-y-3">
          {filteredDrivers.map(driver => (
            <div
              key={driver.id}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 text-white rounded-full flex items-center justify-center text-xl">
                  {driver.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg text-gray-900">{driver.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      driver.status === 'Available'
                        ? 'bg-green-100 text-green-700'
                        : driver.status === 'Busy'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {driver.status}
                    </span>
                    <div className="flex items-center gap-1 text-sm text-yellow-600">
                      <Star className="w-4 h-4 fill-current" />
                      <span>{driver.rating}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">Active</div>
                  <div className="text-xl text-gray-900">{getDriverActiveJobs(driver.id)}</div>
                </div>
              </div>

              <div className="space-y-2 mb-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="w-4 h-4" />
                  <a href={`mailto:${driver.email}`} className="text-blue-600 hover:underline">
                    {driver.email}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4" />
                  <a href={`tel:${driver.phone}`} className="text-blue-600 hover:underline">
                    {driver.phone}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Truck className="w-4 h-4" />
                  <span>{driver.vehicleType}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Package className="w-4 h-4" />
                  <span>{driver.completedJobs} completed</span>
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Star className="w-4 h-4" />
                  <span>{driver.rating}/5.0 rating</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
