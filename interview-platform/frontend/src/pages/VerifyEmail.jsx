import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BrainCircuit, Loader2 } from 'lucide-react';
import api from '../utils/api';

// /verify-email?token=XXX
// Auto-calls the backend on mount. StrictMode-safe: the useRef guard stops
// React's double-invocation in dev from triggering the request twice.
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState({ phase: 'loading', message: '' });
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    if (!token) {
      setState({ phase: 'error', message: 'No verification token in the URL.' });
      return;
    }

    api.post('/auth/verify-email', { token })
      .then((res) => {
        setState({ phase: 'success', message: res.data?.message || 'Email verified!' });
      })
      .catch((err) => {
        setState({
          phase: 'error',
          message: err.response?.data?.error || 'Verification failed. The link may be expired.',
        });
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8 text-center">
        <div className="flex flex-col items-center mb-4">
          <div className="bg-blue-100 p-3 rounded-xl mb-3">
            <BrainCircuit className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Email verification</h1>
        </div>

        {state.phase === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-sm text-gray-500">Verifying your email…</p>
          </div>
        )}

        {state.phase === 'success' && (
          <div className="space-y-3 py-4">
            <div className="text-5xl">✅</div>
            <p className="text-sm text-gray-700">{state.message}</p>
            <Link to="/login" className="btn-primary inline-block px-5 py-2 mt-2">
              Continue to sign in
            </Link>
          </div>
        )}

        {state.phase === 'error' && (
          <div className="space-y-3 py-4">
            <div className="text-5xl">⚠️</div>
            <p className="text-sm text-rose-600">{state.message}</p>
            <p className="text-xs text-gray-400">
              You can request a fresh link by signing in and clicking "Resend verification".
            </p>
            <Link to="/login" className="btn-primary inline-block px-5 py-2 mt-2">
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
