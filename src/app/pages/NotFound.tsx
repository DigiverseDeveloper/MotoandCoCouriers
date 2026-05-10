import { useNavigate } from 'react-router';
import { Home, AlertCircle } from 'lucide-react';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h1 className="text-4xl text-gray-900 mb-2">404</h1>
        <h2 className="text-xl text-gray-700 mb-4">Page Not Found</h2>
        <p className="text-gray-600 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <button
          onClick={() => navigate('/')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition inline-flex items-center gap-2"
        >
          <Home className="w-5 h-5" />
          Go Home
        </button>
      </div>
    </div>
  );
}
