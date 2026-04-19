import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import {
  CreditCard, FileText, BookOpen, Mic, Calendar,
  CheckCircle, AlertCircle, ArrowRight, Clock
} from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [subRes, sessRes] = await Promise.all([
          api.get('/subscriptions/me'),
          api.get('/sessions'),
        ]);
        setSubscription(subRes.data.active_subscription);
        setSessions(sessRes.data.sessions.slice(0, 5));
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const daysLeft = subscription
    ? Math.max(0, Math.ceil((new Date(subscription.end_date) - new Date()) / (1000 * 60 * 60 * 24)))
    : 0;

  const quickLinks = [
    { to: '/plans', icon: CreditCard, label: 'View Plans', color: 'blue', desc: 'Upgrade your subscription' },
    { to: '/resume', icon: FileText, label: 'Upload Resume', color: 'purple', desc: 'Add your latest resume' },
    { to: '/instructions', icon: BookOpen, label: 'Instructions', color: 'amber', desc: 'Customize AI behavior' },
    { to: '/interview', icon: Mic, label: 'Start Interview', color: 'green', desc: 'Begin AI mock interview' },
  ];

  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    green: 'bg-green-50 text-green-600 border-green-100',
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, <span className="text-blue-600">{user?.username}</span> 👋
        </h1>
        <p className="text-gray-500 mt-1">Here's your interview platform overview.</p>
      </div>

      {/* Subscription Banner */}
      <div className={`rounded-xl p-5 mb-8 border ${
        subscription
          ? 'bg-green-50 border-green-200'
          : 'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {subscription ? (
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0" />
            )}
            <div>
              {subscription ? (
                <>
                  <p className="font-semibold text-green-800">Active Subscription — {subscription.plan_name}</p>
                  <p className="text-sm text-green-700 mt-0.5">
                    {daysLeft} days remaining · Expires {new Date(subscription.end_date).toLocaleDateString()}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-amber-800">No Active Subscription</p>
                  <p className="text-sm text-amber-700 mt-0.5">
                    Purchase a plan to access AI interview features
                  </p>
                </>
              )}
            </div>
          </div>
          {!subscription && (
            <Link to="/plans" className="btn-primary flex items-center gap-1.5 text-sm">
              <CreditCard className="w-4 h-4" />
              Buy Plan
            </Link>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {quickLinks.map(({ to, icon: Icon, label, color, desc }) => (
          <Link
            key={to}
            to={to}
            className="card hover:shadow-md transition-shadow flex flex-col gap-3 group"
          >
            <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${colorMap[color]}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{label}</p>
              <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors mt-auto" />
          </Link>
        ))}
      </div>

      {/* Recent Sessions */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Sessions</h2>
          <Link to="/interview" className="text-sm text-blue-600 hover:underline font-medium">
            New Session →
          </Link>
        </div>
        {loading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8">
            <Mic className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No sessions yet. Start your first interview!</p>
            <Link to="/interview" className="btn-primary mt-4 inline-flex items-center gap-2 text-sm">
              <Mic className="w-4 h-4" />
              Start Interview
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {sessions.map((s) => (
              <div key={s.id} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${s.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.title}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(s.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <Link
                  to={`/report/${s.id}`}
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  View Report
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
