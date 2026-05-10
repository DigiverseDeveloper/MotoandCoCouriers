import { Outlet, useNavigate, useLocation } from 'react-router';
import { useApp } from '../context/AppContext';
import { LayoutDashboard, Package, Users, Truck, BarChart3, LogOut } from 'lucide-react';

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useApp();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/jobs', icon: Package, label: 'Jobs' },
    { path: '/admin/customers', icon: Users, label: 'Customers' },
    { path: '/admin/drivers', icon: Truck, label: 'Drivers' },
    { path: '/admin/reports', icon: BarChart3, label: 'Reports' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 shadow-md">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl">Admin Portal</h1>
            <p className="text-sm text-purple-100">Moto & Co Couriers</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-purple-500 rounded-lg transition"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 pb-20">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-around py-2 overflow-x-auto">
          {navItems.map(({ path, icon: Icon, label }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center px-3 py-2 rounded-lg transition min-w-[60px] ${
                isActive(path)
                  ? 'text-purple-600'
                  : 'text-gray-600 hover:text-purple-600'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs mt-1">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
