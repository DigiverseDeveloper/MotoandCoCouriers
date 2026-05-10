import { Outlet, useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { LogOut, Truck } from 'lucide-react';

export function DriverLayout() {
  const navigate = useNavigate();
  const { currentUser, logout } = useApp();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-gradient-to-r from-green-600 to-green-700 text-white p-4 shadow-md">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6" />
            <div>
              <h1 className="text-xl">Moto & Co Driver</h1>
              <p className="text-sm text-green-100">{currentUser?.name}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-green-500 rounded-lg transition"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
