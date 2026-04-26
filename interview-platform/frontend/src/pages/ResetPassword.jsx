import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { BrainCircuit, Eye, EyeOff, Lock } from 'lucide-react';
import api from '../utils/api';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');

  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [show, setShow]               = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [done, setDone]               = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6)        return setError('Password must be at least 6 characters.');
    if (password !== confirm)       return setError("Passwords don't match.");

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      // Auto-redirect to login after a short pause so user sees the success state.
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Shell title="Invalid link">
        <div className="text-center space-y-3">
          <div className="text-5xl">⚠️</div>
          <p className="text-sm text-gray-500">No reset token found in the URL.</p>
          <Link to="/forgot-password" className="btn-primary inline-block px-5 py-2 mt-2">
            Request a new link
          </Link>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell title="Password reset">
        <div className="text-center space-y-3">
          <div className="text-5xl">✅</div>
          <p className="text-sm text-gray-600">Your password has been updated.</p>
          <p className="text-xs text-gray-400">Redirecting to sign in…</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Set a new password">
      <form onSubmit={submit} className="space-y-4">
        <PasswordField
          label="New password"
          value={password}
          onChange={setPassword}
          show={show}
          setShow={setShow}
        />
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          show={show}
          setShow={setShow}
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
          {loading ? 'Updating…' : 'Reset password'}
        </button>
        <p className="text-center text-sm text-gray-500">
          <Link to="/login" className="hover:underline">Back to sign in</Link>
        </p>
      </form>
    </Shell>
  );
}

function Shell({ title, children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-blue-100 p-3 rounded-xl mb-3">
            <BrainCircuit className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, show, setShow }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type={show ? 'text' : 'password'}
          required
          minLength={6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-field pl-10 pr-10"
          placeholder="••••••••"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
