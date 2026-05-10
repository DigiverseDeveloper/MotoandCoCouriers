import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Search, Mail, Phone, Building, Package } from 'lucide-react';
import { format } from 'date-fns';

export function ManageCustomers() {
  const { customers, jobs } = useApp();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (customer.company && customer.company.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getCustomerJobCount = (customerId: string) => {
    return jobs.filter(j => j.customerId === customerId).length;
  };

  const getCustomerCompletedCount = (customerId: string) => {
    return jobs.filter(j => j.customerId === customerId && j.status === 'Delivered').length;
  };

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <div>
        <h2 className="text-2xl text-gray-900 mb-1">Manage Customers</h2>
        <p className="text-sm text-gray-500">View customer information</p>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            placeholder="Search customers..."
          />
        </div>
      </div>

      <div>
        <p className="text-sm text-gray-500 mb-3">{filteredCustomers.length} customers found</p>
        <div className="space-y-3">
          {filteredCustomers.map(customer => (
            <div
              key={customer.id}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-lg text-gray-900">{customer.name}</h3>
                  {customer.company && (
                    <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                      <Building className="w-4 h-4" />
                      <span>{customer.company}</span>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">
                    {getCustomerJobCount(customer.id)} jobs
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="w-4 h-4" />
                  <a href={`mailto:${customer.email}`} className="text-blue-600 hover:underline">
                    {customer.email}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4" />
                  <a href={`tel:${customer.phone}`} className="text-blue-600 hover:underline">
                    {customer.phone}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Package className="w-4 h-4" />
                  <span>{getCustomerCompletedCount(customer.id)} completed</span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Member since {format(new Date(customer.createdAt), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
