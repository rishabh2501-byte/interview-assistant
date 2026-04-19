import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { BrainCircuit, Eye, EyeOff, LogIn } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [callbackError, setCallbackError] = useState(false);

  const electronPort = new URLSearchParams(window.location.search).get('electron_port');
  const isElectronCallback = !!electronPort;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.password);
      const token = localStorage.getItem('token');
      const port = electronPort || '7789';
      if (isElectronCallback) {
        try {
          const res = await fetch(`http://localhost:${port}/auth-callback?token=${encodeURIComponent(token)}`);
          if (!res.ok) throw new Error('bad response');
          setLoginSuccess(true);
        } catch {
          setCallbackError(true);
        }
        return;
      }
      // Silently try to notify Electron if it's running on the default port
      fetch(`http://localhost:7789/auth-callback?token=${encodeURIComponent(token)}`).catch(() => {});
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const fillTest = () => setForm({ email: 'testuser@example.com', password: 'Test@123' });

  if (callbackError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Couldn't reach the app</h2>
          <p className="text-gray-500 text-sm mb-4">
            Login succeeded but the Interview Assistant app couldn't be reached on port <strong>{electronPort}</strong>.
          </p>
          <p className="text-gray-500 text-sm mb-6">Make sure the <strong>Electron app is open</strong>, then click Retry.</p>
          <button
            onClick={() => {
              const token = localStorage.getItem('token');
              fetch(`http://localhost:${electronPort}/auth-callback?token=${encodeURIComponent(token)}`)
                .then((r) => { if (r.ok) setLoginSuccess(true); else setCallbackError(true); })
                .catch(() => setCallbackError(true));
            }}
            className="btn-primary w-full py-2.5"
          >
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  if (loginSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Login Successful!</h2>
          <p className="text-gray-500 text-sm">Return to the <strong>Interview Assistant</strong> app.</p>
          <p className="text-gray-400 text-xs mt-2">You can close this tab.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        {isElectronCallback && (
          <div className="mb-5 p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-2">
            <span className="text-lg">🎯</span>
            <p className="text-xs text-indigo-700 font-medium">
              Signing in for the Interview Assistant desktop app
            </p>
          </div>
        )}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-blue-100 p-3 rounded-xl mb-3">
            <BrainCircuit className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">InterviewAI</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="input-field"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                className="input-field pr-10"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPwd(!showPwd)}
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
            <LogIn className="w-4 h-4" />
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700 font-medium mb-1">Demo Test User</p>
          <p className="text-xs text-amber-600">testuser@example.com / Test@123</p>
          <button onClick={fillTest} className="text-xs text-amber-700 underline mt-1 hover:text-amber-800">
            Click to autofill
          </button>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don't have an account?{' '}
          <Link
            to={electronPort ? `/signup?electron_port=${electronPort}` : '/signup'}
            className="text-blue-600 font-medium hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
