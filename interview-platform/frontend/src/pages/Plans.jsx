import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { CheckCircle, Zap, Star, Crown, PlusCircle } from 'lucide-react';

// Features shown on each subscription tier (extra perks scale up with tier).
const SUB_FEATURES = {
  Starter: ['Real-time AI interview coach', 'Screenshot analysis', 'Dual-device mobile mode', 'PDF session reports'],
  Pro:     ['Everything in Starter', 'Priority AI model tier', 'Conversation memory across session', 'Resume-tailored answers'],
  Ultra:   ['Everything in Pro', 'Fastest AI response times', 'Best value per session', 'Priority support'],
};

const TIER_ICON  = { Starter: Zap, Pro: Star, Ultra: Crown };
const TIER_COLOR = {
  Starter: { ring: 'ring-blue-300',   btn: 'bg-blue-600 hover:bg-blue-700',   badge: 'bg-blue-100 text-blue-800' },
  Pro:     { ring: 'ring-purple-400', btn: 'bg-purple-600 hover:bg-purple-700', badge: 'bg-purple-100 text-purple-800' },
  Ultra:   { ring: 'ring-amber-400',  btn: 'bg-amber-500 hover:bg-amber-600',  badge: 'bg-amber-100 text-amber-800' },
};

export default function Plans() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('type') === 'TOPUP' ? 'TOPUP' : 'SUBSCRIPTION';

  const [plans, setPlans]       = useState([]);
  const [usage, setUsage]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState(initialTab);
  const electronPort = searchParams.get('electron_port');

  useEffect(() => {
    (async () => {
      try {
        const [planRes, usageRes] = await Promise.all([
          api.get('/plans'),
          api.get('/me/usage').catch(() => ({ data: null })),
        ]);
        setPlans(planRes.data.plans || []);
        setUsage(usageRes.data);
      } catch {
        toast.error('Failed to load plans');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const subscriptionPlans = useMemo(() => plans.filter(p => p.plan_type === 'SUBSCRIPTION'), [plans]);
  const topupPlans        = useMemo(() => plans.filter(p => p.plan_type === 'TOPUP'),         [plans]);
  const sub               = usage?.subscription || null;

  const formatAmount = (paise) => `₹${(paise / 100).toLocaleString('en-IN')}`;
  const perSession   = (p) => p.sessions_included ? Math.round(p.price / 100 / p.sessions_included) : null;

  const goto = (plan) => navigate(`/payment/${plan.id}${electronPort ? `?electron_port=${electronPort}` : ''}`);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <div key={i} className="card animate-pulse h-64" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Pricing</h1>
        <p className="text-gray-500 mt-2">Session-based plans. Never pay for what you don't use.</p>
      </div>

      {sub && (
        <div className="max-w-xl mx-auto mb-8 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center text-sm">
          <p className="text-emerald-800">
            ✅ You're on <b>{sub.plan_name}</b>. <b>{sub.sessions_remaining ?? '∞'}</b> sessions remaining,
            expires {new Date(sub.end_date).toLocaleDateString()}.{' '}
            <Link to="/dashboard" className="underline font-medium">View usage →</Link>
          </p>
        </div>
      )}

      {/* Tabs: Subscription | Top-up */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex bg-gray-100 rounded-xl p-1">
          <TabBtn active={tab === 'SUBSCRIPTION'} onClick={() => setTab('SUBSCRIPTION')}>Monthly plans</TabBtn>
          <TabBtn active={tab === 'TOPUP'}        onClick={() => setTab('TOPUP')}>Top-up packs</TabBtn>
        </div>
      </div>

      {tab === 'SUBSCRIPTION' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {subscriptionPlans.map((plan) => {
            const Icon = TIER_ICON[plan.name] || Zap;
            const color = TIER_COLOR[plan.name] || TIER_COLOR.Starter;
            const isPopular = plan.name === 'Pro';
            const features  = SUB_FEATURES[plan.name] || SUB_FEATURES.Starter;
            const isCurrent = sub && sub.plan_name === plan.name;

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-7 flex flex-col bg-white ${
                  isPopular ? `border-transparent ring-2 ring-offset-2 ${color.ring}` : 'border-gray-200'
                }`}
              >
                {isPopular && (
                  <span className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-1 rounded-full ${color.badge} uppercase tracking-widest`}>
                    Most popular
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                    Current
                  </span>
                )}

                <div className="flex items-center gap-2 mb-4">
                  <Icon className="w-5 h-5 text-gray-700" />
                  <h2 className="font-bold text-gray-900 text-lg">{plan.name}</h2>
                </div>

                <div className="mb-1">
                  <span className="text-4xl font-extrabold text-gray-900">{formatAmount(plan.price)}</span>
                  <span className="text-gray-500 text-sm ml-1">/ month</span>
                </div>
                <p className="text-sm text-gray-600 mb-5">
                  <b>{plan.sessions_included}</b> sessions · ~₹{perSession(plan)}/session
                </p>

                <ul className="space-y-2 flex-1 mb-6">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => goto(plan)}
                  disabled={isCurrent}
                  className={`w-full text-white font-semibold py-2.5 rounded-xl transition-colors ${color.btn} disabled:bg-gray-300 disabled:cursor-not-allowed`}
                >
                  {isCurrent ? 'Current plan' : 'Get started'}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {topupPlans.map((plan) => (
            <div key={plan.id} className="rounded-2xl border border-gray-200 p-6 bg-white flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <PlusCircle className="w-5 h-5 text-indigo-600" />
                <h2 className="font-bold text-gray-900 text-lg">{plan.name}</h2>
              </div>
              <div className="mb-1">
                <span className="text-3xl font-extrabold text-gray-900">{formatAmount(plan.price)}</span>
              </div>
              <p className="text-sm text-gray-600 mb-5">
                <b>{plan.sessions_included}</b> sessions · ~₹{perSession(plan)}/session · valid {plan.duration_days} days
              </p>
              <p className="text-xs text-gray-500 mb-6">
                Adds to your existing subscription. No active subscription? A standalone one is created automatically.
              </p>
              <button
                onClick={() => goto(plan)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-colors"
              >
                Buy top-up
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-center text-xs text-gray-400 mt-10">
        Prices in INR. GST included. Payments via Razorpay (UPI, cards, netbanking).
      </p>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
        active ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}
