import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { CreditCard, Shield, CheckCircle, ArrowLeft, Loader } from 'lucide-react';

export default function Payment() {
  const { planId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const electronPort = new URLSearchParams(window.location.search).get('electron_port');

  useEffect(() => {
    api.get(`/plans/${planId}`)
      .then((res) => setPlan(res.data.plan))
      .catch(() => { toast.error('Plan not found'); navigate('/plans'); })
      .finally(() => setLoading(false));
  }, [planId]);

  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (document.getElementById('rzp-script')) return resolve(true);
      const script = document.createElement('script');
      script.id = 'rzp-script';
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
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

      const orderRes = await api.post('/payment/create-order', { plan_id: planId });
      const { order_id, amount, currency, key_id } = orderRes.data;

      const options = {
        key: key_id,
        amount,
        currency,
        name: 'InterviewAI',
        description: `${plan.name} Plan Subscription`,
        order_id,
        prefill: { name: user.username, email: user.email },
        theme: { color: '#2563eb' },
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true,
        },
        handler: async (response) => {
          try {
            await api.post('/payment/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan_id: planId,
            });
            toast.success('Payment successful! Subscription activated.');
            if (electronPort) {
              try { await fetch(`http://localhost:${electronPort}/subscription-updated`); } catch {}
              toast.success('Return to the Interview Assistant app!', { duration: 4000 });
            }
            navigate('/dashboard');
          } catch (err) {
            toast.error(err.response?.data?.error || 'Payment verification failed');
          }
        },
        modal: {
          ondismiss: () => toast('Payment cancelled', { icon: '⚠️' }),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to initiate payment');
    } finally {
      setPaying(false);
    }
  };

  const formatAmount = (paise) => `₹${(paise / 100).toLocaleString('en-IN')}`;
  const formatDuration = (days) => {
    if (days >= 365) return `${Math.round(days / 365)} Year`;
    if (days >= 30) return `${Math.round(days / 30)} Month${Math.round(days / 30) > 1 ? 's' : ''}`;
    return `${days} Days`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <button
        onClick={() => navigate('/plans')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Plans
      </button>

      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-blue-100 p-2.5 rounded-xl">
            <CreditCard className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Complete Payment</h1>
            <p className="text-gray-500 text-sm">Secure checkout via Razorpay</p>
          </div>
        </div>

        {/* Order Summary */}
        <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Order Summary</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Plan</span>
              <span className="font-medium text-gray-900">{plan?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Duration</span>
              <span className="font-medium text-gray-900">{formatDuration(plan?.duration_days)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
              <span className="font-semibold text-gray-800">Total</span>
              <span className="font-bold text-blue-600 text-lg">{formatAmount(plan?.price)}</span>
            </div>
          </div>
        </div>

        {/* Payment Methods Info */}
        <div className="mb-6">
          <p className="text-xs text-gray-500 font-medium mb-2">Accepted payment methods</p>
          <div className="flex flex-wrap gap-2">
            {['UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Wallets'].map((m) => (
              <span key={m} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg border border-gray-200">
                {m}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={handlePay}
          disabled={paying}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
        >
          {paying ? (
            <Loader className="w-5 h-5 animate-spin" />
          ) : (
            <CreditCard className="w-5 h-5" />
          )}
          {paying ? 'Processing...' : `Pay ${formatAmount(plan?.price)}`}
        </button>

        <div className="flex items-center justify-center gap-1.5 mt-4 text-xs text-gray-400">
          <Shield className="w-3.5 h-3.5" />
          <span>256-bit SSL encrypted · Secured by Razorpay</span>
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex items-start gap-2">
          <CheckCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700">
            Your subscription will be activated immediately after successful payment.
          </p>
        </div>
      </div>
    </div>
  );
}
