import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BrainCircuit, Mail, ArrowLeft } from 'lucide-react';
import api from '../utils/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-blue-100 p-3 rounded-xl mb-3">
            <BrainCircuit className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Forgot password?</h1>
          <p className="text-gray-500 text-sm mt-1 text-center">
            No worries — we'll email you a link to reset it.
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-3">
            <div className="text-5xl mb-2">📬</div>
            <h2 className="text-lg font-semibold text-gray-900">Check your email</h2>
            <p className="text-sm text-gray-500">
              If an account with <b>{email}</b> exists, a reset link is on its way.
              The link expires in 1 hour.
            </p>
            <p className="text-xs text-gray-400">
              Didn't get it? Check spam, or wait a minute and try again.
            </p>
            <Link to="/login" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2">
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  required
                  className="input-field pl-10"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <div className="text-center text-sm">
              <Link to="/login" className="text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
