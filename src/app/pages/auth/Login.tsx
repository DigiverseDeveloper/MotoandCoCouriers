import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useApp } from '../../context/AppContext';
import { ArrowLeft, Mail, Lock } from 'lucide-react';

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role') as 'customer' | 'driver' | 'admin' || 'customer';
  const { login, isLoading, error } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const demoEmails = {
    customer: 'customer@example.invalid',
    driver: 'driver@example.invalid',
    admin: 'admin@example.invalid',
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const submittedPassword = password;
    setPassword('');
    const ok = await login(role, email, submittedPassword);
    if (ok) navigate(`/${role}`);
  };

  const handleDemoLogin = async () => {
    const demoEmail = demoEmails[role];
    setEmail(demoEmail);
    const ok = await login(role, demoEmail);
    if (ok) navigate(`/${role}`);
  };

  const getRoleColor = () => {
    switch (role) {
      case 'driver': return 'green';
      case 'admin': return 'purple';
      default: return 'blue';
    }
  };

  const color = getRoleColor();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white shadow-sm border-b border-gray-200 p-4">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl text-gray-900">
            {role.charAt(0).toUpperCase() + role.slice(1)} Login
          </h1>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm text-gray-700 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full bg-${color}-600 hover:bg-${color}-700 text-white py-3 rounded-lg transition`}
              style={{
                backgroundColor: color === 'blue' ? '#2563eb' : color === 'green' ? '#059669' : '#7c3aed',
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={handleDemoLogin}
              disabled={isLoading}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-lg transition"
            >
              Use Demo Account
            </button>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/signup?role=' + role)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Don't have an account? Sign up
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
