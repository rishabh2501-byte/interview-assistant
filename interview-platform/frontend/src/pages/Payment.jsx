import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import {
  CreditCard, Shield, CheckCircle, ArrowLeft, Loader,
  Smartphone, Building2, Wallet, PlusCircle,
} from 'lucide-react';

// Checkout page. Supports both SUBSCRIPTION and TOPUP plans — the plan
// type determines copy, post-payment message, and success redirect.
// UPI is presented as the primary method (via `config: { display: ... }`
// in Razorpay options) since this is an India-first product.
export default function Payment() {
  const { planId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plan, setPlan]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying]   = useState(false);
  const [success, setSuccess] = useState(null); // { message, subscription } after verify

  const electronPort = new URLSearchParams(window.location.search).get('electron_port');
  const isTopup = plan?.plan_type === 'TOPUP';

  useEffect(() => {
    api.get(`/plans/${planId}`)
      .then((res) => setPlan(res.data.plan))
      .catch(() => { toast.error('Plan not found'); navigate('/plans'); })
      .finally(() => setLoading(false));
  }, [planId]);

  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload  = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const handlePay = async () => {
    setPaying(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        toast.error('Razorpay SDK failed to load. Check your connection.');
        return;
      }

      const { data: order } = await api.post('/payment/create-order', { plan_id: planId });
      const { order_id, amount, currency, key_id } = order;

      if (!key_id) {
        toast.error('Payments are not configured on the server. Contact support.');
        return;
      }

      const options = {
        key: key_id,
        amount,
        currency,
        name: 'Interview Assistant',
        description: isTopup
          ? `${plan.name} — ${plan.sessions_included} session top-up`
          : `${plan.name} plan — ${plan.sessions_included} sessions / month`,
        order_id,
        prefill: { name: user?.username || '', email: user?.email || '' },
        theme: { color: '#2563eb' },
        // Put UPI first in the checkout UI (India-first).
        config: {
          display: {
            blocks: {
              upi: {
                name: 'Pay via UPI',
                instruments: [{ method: 'upi' }],
              },
              other: {
                name: 'Other methods',
                instruments: [
                  { method: 'card' },
                  { method: 'netbanking' },
                  { method: 'wallet' },
                ],
              },
            },
            sequence: ['block.upi', 'block.other'],
            preferences: { show_default_blocks: false },
          },
        },
        method: { upi: true, card: true, netbanking: true, wallet: true },
        handler: async (response) => {
          try {
            const verifyRes = await api.post('/payment/verify', {
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              plan_id: planId,
            });
            setSuccess(verifyRes.data);
            toast.success(verifyRes.data.message || 'Payment successful');

            // Tell Electron (if launched via deeplink) that subscription changed.
            if (electronPort) {
              fetch(`http://localhost:${electronPort}/subscription-updated`).catch(() => {});
            }
          } catch (err) {
            toast.error(err.response?.data?.error || 'Payment verification failed');
          }
        },
        modal: {
          ondismiss: () => toast('Payment cancelled', { icon: '⚠️' }),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        toast.error(resp.error?.description || 'Payment failed. Please try again.');
      });
      rzp.open();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to initiate payment');
    } finally {
      setPaying(false);
    }
  };

  const formatAmount = (paise) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  // ─── Render ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Post-payment success state
  if (success) {
    const s = success.subscription || {};
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="card text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment successful</h1>
          <p className="text-gray-600 mb-6">{success.message}</p>

          <div className="bg-gray-50 rounded-xl p-4 text-left text-sm space-y-2 mb-6 border border-gray-200">
            <Row label="Plan"       value={s.plan} />
            <Row label="Type"       value={s.plan_type === 'TOPUP' ? 'Top-up' : 'Subscription'} />
            <Row label="Sessions"   value={`${s.sessions_granted || 0} granted`} />
            <Row label="Valid till" value={s.end_date ? new Date(s.end_date).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—'} />
          </div>

          <button
            onClick={() => navigate('/dashboard')}
            className="btn-primary w-full py-3"
          >
            Go to Dashboard
          </button>
          {electronPort && (
            <p className="text-xs text-gray-400 mt-3">You can now return to the Interview Assistant app.</p>
          )}
        </div>
      </div>
    );
  }

  const perSession = plan?.sessions_included
    ? Math.round(plan.price / 100 / plan.sessions_included)
    : null;

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <button
        onClick={() => navigate('/plans')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to plans
      </button>

      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <div className={`p-2.5 rounded-xl ${isTopup ? 'bg-indigo-100' : 'bg-blue-100'}`}>
            {isTopup
              ? <PlusCircle className="w-6 h-6 text-indigo-600" />
              : <CreditCard  className="w-6 h-6 text-blue-600" />}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {isTopup ? 'Buy top-up' : 'Complete payment'}
            </h1>
            <p className="text-gray-500 text-sm">Secure checkout via Razorpay</p>
          </div>
        </div>

        {/* Order Summary */}
        <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Order summary</h2>
          <div className="space-y-2 text-sm">
            <Row label="Plan"     value={plan?.name} />
            <Row label="Type"     value={isTopup ? 'One-time top-up' : 'Monthly subscription'} />
            <Row label="Sessions" value={`${plan?.sessions_included} sessions`} />
            {perSession && <Row label="Per session" value={`₹${perSession}`} />}
            <Row label="Validity" value={`${plan?.duration_days} days`} />
            <div className="border-t border-gray-200 pt-3 mt-3 flex justify-between items-baseline">
              <span className="font-semibold text-gray-800">Total</span>
              <span className="font-bold text-blue-600 text-2xl">{formatAmount(plan?.price)}</span>
            </div>
          </div>
        </div>

        {/* Payment methods preview */}
        <div className="mb-6">
          <p className="text-xs text-gray-500 font-medium mb-2">Preferred: UPI</p>
          <div className="grid grid-cols-4 gap-2 text-[11px]">
            <MethodChip icon={Smartphone} label="UPI" primary />
            <MethodChip icon={CreditCard} label="Cards" />
            <MethodChip icon={Building2} label="Netbanking" />
            <MethodChip icon={Wallet}    label="Wallets" />
          </div>
        </div>

        <button
          onClick={handlePay}
          disabled={paying}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
        >
          {paying ? <Loader className="w-5 h-5 animate-spin" /> : <Smartphone className="w-5 h-5" />}
          {paying ? 'Opening checkout…' : `Pay ${formatAmount(plan?.price)}`}
        </button>

        <div className="flex items-center justify-center gap-1.5 mt-4 text-xs text-gray-400">
          <Shield className="w-3.5 h-3.5" />
          <span>256-bit SSL · Secured by Razorpay</span>
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex items-start gap-2">
          <CheckCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700">
            {isTopup
              ? 'Sessions are credited to your active subscription instantly after payment. If you don\'t have one, a standalone pack is created.'
              : 'Your subscription activates immediately. You can start using AI interview features right away.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900 text-right">{value || '—'}</span>
    </div>
  );
}

function MethodChip({ icon: Icon, label, primary }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg border ${
      primary ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600'
    }`}>
      <Icon className="w-4 h-4" />
      <span className="font-medium">{label}</span>
    </div>
  );
}
