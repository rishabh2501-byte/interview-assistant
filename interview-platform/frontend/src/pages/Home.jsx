import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  BrainCircuit, Mic, Smartphone, Camera, EyeOff, Zap,
  CheckCircle, ArrowRight, Github, Twitter, Mail,
} from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

// Public landing page. Authenticated users are redirected to the dashboard
// so /  is not an anonymous preview of their logged-in world.
export default function Home() {
  const { isAuthenticated } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/plans?type=SUBSCRIPTION')
      .then(r => setPlans(r.data.plans || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const formatINR = (paise) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  return (
    <div className="min-h-screen bg-white">
      {/* Top nav */}
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold text-gray-900">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
              <BrainCircuit className="w-4 h-4 text-white" />
            </div>
            Interview Assistant
          </Link>
          <nav className="flex items-center gap-1">
            <a href="#features" className="hidden sm:inline-block px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Features</a>
            <a href="#pricing"  className="hidden sm:inline-block px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Pricing</a>
            <a href="#faq"      className="hidden sm:inline-block px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">FAQ</a>
            <Link to="/login"  className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900 font-medium">Sign in</Link>
            <Link to="/signup" className="px-4 py-1.5 text-sm font-medium rounded-lg bg-gray-900 text-white hover:bg-black ml-2">Get started</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium mb-5">
          <Zap className="w-3.5 h-3.5" /> Real-time AI interview coach
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-gray-900 leading-[1.1]">
          Ace every interview.<br />
          <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Without anyone knowing.
          </span>
        </h1>
        <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
          A discreet desktop assistant that listens to your interview, understands the question,
          and streams a senior-level answer to your phone — in seconds.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link to="/signup" className="btn-primary px-6 py-3 text-base flex items-center gap-2">
            Start free <ArrowRight className="w-4 h-4" />
          </Link>
          <a href="#pricing" className="px-6 py-3 text-base font-medium text-gray-700 hover:text-gray-900">See pricing →</a>
        </div>
        <p className="mt-4 text-xs text-gray-400">No credit card required · Cancel anytime</p>
      </section>

      {/* Features */}
      <section id="features" className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900">Built for real interviews</h2>
            <p className="text-gray-500 mt-2">Everything you need — nothing you don't.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <Feature
              icon={Mic}
              title="Real-time audio"
              text="Captures and transcribes your interviewer on the fly. No copy-paste, no manual triggers needed."
            />
            <Feature
              icon={Camera}
              title="Screenshot analysis"
              text="Snap any coding problem, MCQ, or system design diagram. GPT-4o vision reads it and answers."
            />
            <Feature
              icon={Smartphone}
              title="Dual-device mode"
              text="Pair your phone with a QR code. All answers stream to mobile — desktop stays clean."
            />
            <Feature
              icon={EyeOff}
              title="Stealth-first design"
              text="Undetectable by screen share. No cursor changes, no overlay, no telltale UI."
            />
            <Feature
              icon={BrainCircuit}
              title="Senior-level answers"
              text="Bullet-pointed, interview-ready, tailored to your resume and role. No robotic fluff."
            />
            <Feature
              icon={Zap}
              title="Fast as typing"
              text="First token under a second. Streams in real-time so you can follow along naturally."
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Simple, session-based pricing</h2>
            <p className="text-gray-500 mt-2">Pay for sessions, not time. Top-ups whenever you need more.</p>
          </div>

          {loading ? (
            <div className="grid md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => <div key={i} className="rounded-2xl border border-gray-200 h-72 animate-pulse bg-gray-50" />)}
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-6">
              {plans.map((plan) => {
                const isPopular = plan.name === 'Pro';
                const perSession = plan.sessions_included ? Math.round(plan.price / 100 / plan.sessions_included) : null;
                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-2xl p-7 bg-white border ${isPopular ? 'border-transparent ring-2 ring-purple-400 ring-offset-2' : 'border-gray-200'}`}
                  >
                    {isPopular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-1 rounded-full bg-purple-100 text-purple-800 uppercase tracking-widest">
                        Most popular
                      </span>
                    )}
                    <h3 className="font-bold text-lg text-gray-900">{plan.name}</h3>
                    <div className="mt-3">
                      <span className="text-4xl font-extrabold text-gray-900">{formatINR(plan.price)}</span>
                      <span className="text-gray-500 text-sm ml-1">/ month</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1 mb-6">
                      {plan.sessions_included} sessions · ~₹{perSession}/session
                    </p>
                    <ul className="space-y-2 mb-6 text-sm">
                      <Tick>Real-time AI interview coach</Tick>
                      <Tick>Screenshot + audio analysis</Tick>
                      <Tick>Dual-device mobile mode</Tick>
                      <Tick>PDF session reports</Tick>
                      {plan.name !== 'Starter' && <Tick>Priority AI model tier</Tick>}
                      {plan.name === 'Ultra' && <Tick>Fastest response times</Tick>}
                    </ul>
                    <Link
                      to="/signup"
                      className={`block text-center w-full py-2.5 rounded-xl font-semibold text-white transition ${isPopular ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-900 hover:bg-black'}`}
                    >
                      Get {plan.name}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-center text-xs text-gray-400 mt-8">
            Need more? Buy top-up packs (5 or 10 sessions) any time after signup.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-gray-50 py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-10">Frequently asked</h2>
          <div className="space-y-4">
            <Faq q="Is it undetectable on Zoom/Meet screen share?">
              Yes. The desktop window uses content-protection flags so it's excluded from screen capture. Stealth mode further hides all UI on desktop — answers appear only on your phone.
            </Faq>
            <Faq q="What counts as a 'session'?">
              One interview round, capped at ~60 min of continuous use. You can ask as many follow-up questions as needed within that window at no extra cost.
            </Faq>
            <Faq q="Can I use it without a phone?">
              Absolutely. The desktop app works standalone. Dual-device mode is optional for when you want the answers off your main screen.
            </Faq>
            <Faq q="What happens if my session runs out mid-interview?">
              You'll get a quota warning 2 sessions before empty. You can buy a top-up pack in 30 seconds from the dashboard and keep going.
            </Faq>
            <Faq q="Which AI models do you use?">
              OpenAI's GPT-4o and GPT-4o-mini for chat + vision. All requests stream so you start seeing the answer within ~1 second.
            </Faq>
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Your next interview is the last tough one.</h2>
          <p className="text-gray-500 mt-3 mb-8 text-lg">Sign up, pair your phone, walk in confident.</p>
          <Link to="/signup" className="btn-primary px-8 py-3.5 text-base inline-flex items-center gap-2">
            Create free account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-10 text-sm text-gray-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Interview Assistant. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="mailto:support@interview-assistant.local" className="hover:text-gray-800 flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Support</a>
            <Link to="/login" className="hover:text-gray-800">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, title, text }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-md transition">
      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-blue-600" />
      </div>
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{text}</p>
    </div>
  );
}

function Tick({ children }) {
  return (
    <li className="flex items-start gap-2 text-gray-700">
      <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </li>
  );
}

function Faq({ q, children }) {
  return (
    <details className="bg-white rounded-xl border border-gray-200 p-5 group">
      <summary className="flex items-center justify-between cursor-pointer font-semibold text-gray-900 list-none">
        {q}
        <span className="text-gray-400 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
      </summary>
      <p className="mt-3 text-sm text-gray-600 leading-relaxed">{children}</p>
    </details>
  );
}
