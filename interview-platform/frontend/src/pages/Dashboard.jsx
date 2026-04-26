import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
  CreditCard, FileText, BookOpen, Mic, Clock,
  CheckCircle, AlertCircle, ArrowRight, Zap, MailCheck, MailWarning, PlusCircle,
} from 'lucide-react';

// Dashboard — pulls consolidated state from /api/me/usage and shows:
//   • Current plan + session quota (big hero card)
//   • Email verification banner if unverified
//   • Quick action links (resume, instructions, interview, plans)
//   • Recent sessions + billing history
export default function Dashboard() {
  const { user } = useAuth();
  const [usage, setUsage]         = useState(null);
  const [sessions, setSessions]   = useState([]);
  const [payments, setPayments]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [resending, setResending] = useState(false);

  const reload = async () => {
    try {
      const [usageRes, sessRes, payRes] = await Promise.all([
        api.get('/me/usage'),
        api.get('/sessions'),
        api.get('/payment/history').catch(() => ({ data: { payments: [] } })),
      ]);
      setUsage(usageRes.data);
      setSessions((sessRes.data.sessions || []).slice(0, 5));
      setPayments((payRes.data.payments || []).slice(0, 5));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const sub         = usage?.subscription || null;
  const remaining   = sub?.sessions_remaining;
  const granted     = sub?.sessions_granted || 0;
  const used        = sub?.sessions_used || 0;
  const pct         = granted > 0 ? Math.min(100, Math.round((used / granted) * 100)) : 0;
  const daysLeft    = sub ? Math.max(0, Math.ceil((new Date(sub.end_date) - new Date()) / 86400000)) : 0;
  const emailVerified = usage?.user?.email_verified ?? user?.email_verified ?? true;

  const resendVerify = async () => {
    setResending(true);
    try {
      const res = await api.post('/auth/resend-verification');
      toast.success(res.data.alreadyVerified ? 'Already verified!' : 'Verification email sent');
      if (res.data.alreadyVerified) reload();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not send');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, <span className="text-blue-600">{user?.username}</span> 👋
        </h1>
        <p className="text-gray-500 mt-1">Here's your interview platform overview.</p>
      </div>

      {/* Email verification banner */}
      {!loading && !emailVerified && (
        <div className="rounded-xl p-4 mb-6 border bg-amber-50 border-amber-200 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <MailWarning className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-amber-800 text-sm">Verify your email</p>
              <p className="text-xs text-amber-700">We sent you a link when you signed up. Didn't get it?</p>
            </div>
          </div>
          <button
            onClick={resendVerify}
            disabled={resending}
            className="text-sm font-medium px-3 py-1.5 bg-white border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-100 disabled:opacity-50"
          >
            {resending ? 'Sending…' : 'Resend email'}
          </button>
        </div>
      )}

      {/* Plan / quota hero card */}
      <div className={`rounded-2xl p-6 mb-8 border ${sub ? 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
        {loading ? (
          <div className="h-24 animate-pulse" />
        ) : sub ? (
          <div className="grid md:grid-cols-[1fr_auto] gap-4 items-center">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <span className="font-semibold text-gray-900">{sub.plan_name} plan</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/60 border border-white text-gray-600">
                  {sub.plan_type === 'TOPUP' ? 'Top-up active' : 'Active'}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Expires on {new Date(sub.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {' · '} {daysLeft} days left
              </p>

              {/* Quota bar */}
              {granted > 0 ? (
                <>
                  <div className="flex items-end justify-between mb-1">
                    <div>
                      <span className="text-3xl font-extrabold text-gray-900">{remaining ?? 0}</span>
                      <span className="text-gray-500 text-sm ml-1">/ {granted} sessions left</span>
                    </div>
                    <span className="text-xs text-gray-500">{used} used</span>
                  </div>
                  <div className="w-full bg-white/60 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full transition-all ${pct > 85 ? 'bg-rose-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-600">Unlimited sessions included.</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Link to="/interview" className="btn-primary text-sm flex items-center justify-center gap-1.5 px-5 py-2.5">
                <Mic className="w-4 h-4" /> Start Interview
              </Link>
              <Link to="/plans?type=TOPUP" className="text-sm flex items-center justify-center gap-1.5 px-5 py-2 border border-gray-300 rounded-xl hover:bg-white font-medium text-gray-700">
                <PlusCircle className="w-4 h-4" /> Buy top-up
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-amber-800">No active subscription</p>
                <p className="text-sm text-amber-700 mt-0.5">Pick a plan to unlock AI interview assistance.</p>
              </div>
            </div>
            <Link to="/plans" className="btn-primary flex items-center gap-1.5 text-sm">
              <CreditCard className="w-4 h-4" /> See plans
            </Link>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <QuickLink to="/plans"        icon={CreditCard} label="Plans"        desc="Browse subscriptions" color="blue" />
        <QuickLink to="/resume"       icon={FileText}   label="Resume"       desc="Upload your CV"      color="purple" />
        <QuickLink to="/instructions" icon={BookOpen}   label="Instructions" desc="Tune AI behaviour"   color="amber" />
        <QuickLink to="/interview"    icon={Mic}        label="Interview"    desc="Begin a session"     color="green" />
      </div>

      {/* Recent sessions + billing side by side */}
      <div className="grid md:grid-cols-2 gap-6">
        <section className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent sessions</h2>
            <Link to="/interview" className="text-sm text-blue-600 hover:underline font-medium">New →</Link>
          </div>
          {loading ? (
            <p className="text-gray-400 text-sm">Loading…</p>
          ) : sessions.length === 0 ? (
            <EmptyState icon={Mic} text="No sessions yet. Start your first interview!" />
          ) : (
            <ul className="divide-y divide-gray-100">
              {sessions.map((s) => (
                <li key={s.id} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{s.title}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(s.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                  <Link to={`/report/${s.id}`} className="text-xs text-blue-600 hover:underline font-medium ml-3 flex-shrink-0">
                    Report →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Billing history</h2>
            <Link to="/plans" className="text-sm text-blue-600 hover:underline font-medium">Manage →</Link>
          </div>
          {loading ? (
            <p className="text-gray-400 text-sm">Loading…</p>
          ) : payments.length === 0 ? (
            <EmptyState icon={CreditCard} text="No payments yet." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {payments.map((p) => (
                <li key={p.id} className="py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.plan_name || 'Plan'}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(p.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-sm font-semibold text-gray-800">₹{(p.amount / 100).toLocaleString('en-IN')}</p>
                    <p className={`text-xs font-medium ${p.status === 'SUCCESS' ? 'text-emerald-600' : p.status === 'FAILED' ? 'text-rose-600' : 'text-amber-600'}`}>
                      {p.status}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label, desc, color }) {
  const colorMap = {
    blue:   'bg-blue-50 text-blue-600 border-blue-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    amber:  'bg-amber-50 text-amber-600 border-amber-100',
    green:  'bg-emerald-50 text-emerald-600 border-emerald-100',
  };
  return (
    <Link to={to} className="card hover:shadow-md transition-shadow flex flex-col gap-3 group">
      <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${colorMap[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{label}</p>
        <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors mt-auto" />
    </Link>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="text-center py-8">
      <Icon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-gray-500 text-sm">{text}</p>
    </div>
  );
}
