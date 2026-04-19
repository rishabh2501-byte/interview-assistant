import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { CheckCircle, Zap, Star, Crown, Sparkles } from 'lucide-react';

const planIcons = [Zap, Star, Crown, Sparkles];
const planColors = [
  { bg: 'bg-blue-50', border: 'border-blue-200', btn: 'bg-blue-600 hover:bg-blue-700', badge: 'bg-blue-100 text-blue-800' },
  { bg: 'bg-purple-50', border: 'border-purple-200', btn: 'bg-purple-600 hover:bg-purple-700', badge: 'bg-purple-100 text-purple-800' },
  { bg: 'bg-amber-50', border: 'border-amber-200', btn: 'bg-amber-500 hover:bg-amber-600', badge: 'bg-amber-100 text-amber-800' },
  { bg: 'bg-green-50', border: 'border-green-200', btn: 'bg-green-600 hover:bg-green-700', badge: 'bg-green-100 text-green-800' },
];

const planFeatures = [
  ['AI Mock Interviews', 'Q&A Session Logs', 'Resume Upload', 'PDF Report Download'],
  ['AI Mock Interviews', 'Q&A Session Logs', 'Resume Upload', 'PDF Report Download', 'Custom Instructions'],
  ['AI Mock Interviews', 'Q&A Session Logs', 'Resume Upload', 'PDF Report Download', 'Custom Instructions', 'Priority Support'],
  ['AI Mock Interviews', 'Q&A Session Logs', 'Resume Upload', 'PDF Report Download', 'Custom Instructions', 'Priority Support', 'Unlimited Sessions'],
];

export default function Plans() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  const electronPort = new URLSearchParams(window.location.search).get('electron_port');

  useEffect(() => {
    const fetch = async () => {
      try {
        const [planRes, subRes] = await Promise.all([
          api.get('/plans'),
          api.get('/subscriptions/me'),
        ]);
        setPlans(planRes.data.plans);
        setSubscription(subRes.data.active_subscription);
      } catch {
        toast.error('Failed to load plans');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const formatAmount = (paise) => `₹${(paise / 100).toLocaleString('en-IN')}`;
  const formatDuration = (days) => {
    if (days >= 365) return `${Math.round(days / 365)} Year`;
    if (days >= 30) return `${Math.round(days / 30)} Month${Math.round(days / 30) > 1 ? 's' : ''}`;
    return `${days} Days`;
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card animate-pulse h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900">Choose Your Plan</h1>
        <p className="text-gray-500 mt-2">Unlock AI-powered interview preparation</p>
      </div>

      {subscription && (
        <div className="max-w-xl mx-auto mb-8 p-4 bg-green-50 border border-green-200 rounded-xl text-center">
          <p className="text-green-800 font-medium">
            ✅ You have an active <strong>{subscription.plan_name}</strong> subscription expiring on{' '}
            {new Date(subscription.end_date).toLocaleDateString()}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan, i) => {
          const Icon = planIcons[i % planIcons.length];
          const color = planColors[i % planColors.length];
          const features = planFeatures[i] || planFeatures[0];
          const isPopular = i === 1;

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border-2 p-6 flex flex-col ${color.bg} ${color.border} ${
                isPopular ? 'ring-2 ring-purple-400 ring-offset-2' : ''
              }`}
            >
              {isPopular && (
                <span className={`absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full ${color.badge}`}>
                  MOST POPULAR
                </span>
              )}

              <div className="flex items-center gap-2 mb-4">
                <Icon className="w-5 h-5" />
                <h2 className="font-bold text-gray-900 text-lg">{plan.name}</h2>
              </div>

              <div className="mb-2">
                <span className="text-3xl font-extrabold text-gray-900">{formatAmount(plan.price)}</span>
              </div>
              <p className="text-sm text-gray-600 mb-5">
                {formatDuration(plan.duration_days)} access
              </p>

              <ul className="space-y-2 flex-1 mb-6">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => navigate(`/payment/${plan.id}${electronPort ? `?electron_port=${electronPort}` : ''}`)}
                className={`w-full text-white font-semibold py-2.5 rounded-xl transition-colors ${color.btn}`}
              >
                Get Started
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
