import { useNavigate } from 'react-router';
import { User, Truck, Shield, Package } from 'lucide-react';

export function RoleSelect() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Package className="w-10 h-10 text-blue-600" />
            <h1 className="text-3xl text-gray-900">Moto & Co</h1>
          </div>
          <h2 className="text-xl text-gray-700">Couriers</h2>
          <p className="text-sm text-gray-500 mt-2">Fast, reliable local delivery</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => navigate('/login?role=customer')}
            className="w-full bg-white border-2 border-blue-200 hover:border-blue-400 rounded-xl p-6 flex items-center gap-4 transition shadow-sm hover:shadow-md"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-left flex-1">
              <h3 className="text-lg text-gray-900">Customer</h3>
              <p className="text-sm text-gray-500">Book and track deliveries</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/login?role=driver')}
            className="w-full bg-white border-2 border-green-200 hover:border-green-400 rounded-xl p-6 flex items-center gap-4 transition shadow-sm hover:shadow-md"
          >
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <Truck className="w-6 h-6 text-green-600" />
            </div>
            <div className="text-left flex-1">
              <h3 className="text-lg text-gray-900">Driver</h3>
              <p className="text-sm text-gray-500">Manage your deliveries</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/login?role=admin')}
            className="w-full bg-white border-2 border-purple-200 hover:border-purple-400 rounded-xl p-6 flex items-center gap-4 transition shadow-sm hover:shadow-md"
          >
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
              <Shield className="w-6 h-6 text-purple-600" />
            </div>
            <div className="text-left flex-1">
              <h3 className="text-lg text-gray-900">Admin</h3>
              <p className="text-sm text-gray-500">Manage operations</p>
            </div>
          </button>
        </div>

        <p className="text-center text-xs text-gray-500">
          This is a prototype app designed for Zoho Creator migration
        </p>
      </div>
    </div>
  );
}
