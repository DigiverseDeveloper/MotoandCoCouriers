import { Outlet, useNavigate, useLocation } from 'react-router';
import { useApp } from '../context/AppContext';
import { Package, History, LogOut, Plus } from 'lucide-react';

export function CustomerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useApp();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 shadow-md">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl">Moto & Co</h1>
            <p className="text-sm text-blue-100">{currentUser?.name}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-blue-500 rounded-lg transition"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 pb-20">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-around py-2">
          <button
            onClick={() => navigate('/customer')}
            className={`flex flex-col items-center px-4 py-2 rounded-lg transition ${
              isActive('/customer')
                ? 'text-blue-600'
                : 'text-gray-600 hover:text-blue-600'
            }`}
          >
            <Package className="w-6 h-6" />
            <span className="text-xs mt-1">Jobs</span>
          </button>

          <button
            onClick={() => navigate('/customer/create-job')}
            className="flex flex-col items-center px-6 py-2 bg-blue-600 text-white rounded-xl shadow-lg -mt-6 transition hover:bg-blue-700"
          >
            <Plus className="w-7 h-7" />
            <span className="text-xs mt-1">New Job</span>
          </button>

          <button
            onClick={() => navigate('/customer/history')}
            className={`flex flex-col items-center px-4 py-2 rounded-lg transition ${
              isActive('/customer/history')
                ? 'text-blue-600'
                : 'text-gray-600 hover:text-blue-600'
            }`}
          >
            <History className="w-6 h-6" />
            <span className="text-xs mt-1">History</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
