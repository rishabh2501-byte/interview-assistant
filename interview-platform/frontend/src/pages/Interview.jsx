import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
  Mic, Send, StopCircle, FileBarChart, Loader,
  Bot, User, AlertCircle, Plus, ChevronDown
} from 'lucide-react';

function Message({ role, content, timestamp }) {
  return (
    <div className={`flex gap-3 ${role === 'user' ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        role === 'user' ? 'bg-blue-600' : 'bg-gray-200'
      }`}>
        {role === 'user'
          ? <User className="w-4 h-4 text-white" />
          : <Bot className="w-4 h-4 text-gray-600" />}
      </div>
      <div className={`max-w-[80%] ${role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          role === 'user'
            ? 'bg-blue-600 text-white rounded-tr-sm'
            : 'bg-gray-100 text-gray-800 rounded-tl-sm'
        }`}>
          {content}
        </div>
        {timestamp && (
          <span className="text-xs text-gray-400">
            {new Date(timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Interview() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [title, setTitle] = useState('');
  const [showNewSession, setShowNewSession] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.get('/sessions')
      .then((res) => setSessions(res.data.sessions))
      .catch(() => {})
      .finally(() => setLoadingSessions(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startSession = async () => {
    setStarting(true);
    try {
      const res = await api.post('/sessions/start', { title: title || 'Interview Session' });
      setSession(res.data.session);
      setMessages([
        {
          role: 'assistant',
          content: `Hello! I'm your AI interview assistant. I'm ready to help you practice for your interview. What would you like to work on today?\n\nYou can ask me:\n• Technical questions (algorithms, system design, etc.)\n• Behavioral questions (STAR method, leadership, etc.)\n• Role-specific questions\n\nFeel free to start with any question!`,
          timestamp: new Date(),
        },
      ]);
      setTitle('');
      setShowNewSession(false);
      toast.success('Session started!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start session');
    } finally {
      setStarting(false);
    }
  };

  const loadSession = async (s) => {
    setSession(s);
    try {
      const res = await api.get(`/sessions/${s.id}`);
      const msgs = [];
      for (const log of res.data.logs) {
        msgs.push({ role: 'user', content: log.question, timestamp: log.created_at });
        if (log.answer) msgs.push({ role: 'assistant', content: log.answer, timestamp: log.created_at });
      }
      setMessages(msgs.length > 0 ? msgs : [{
        role: 'assistant',
        content: 'Session loaded. Continue your interview practice!',
        timestamp: new Date(),
      }]);
    } catch {
      toast.error('Failed to load session history');
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !session) return;
    if (session.status === 'ENDED') {
      toast.error('This session has ended. Start a new one.');
      return;
    }

    const question = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: question, timestamp: new Date() }]);
    setSending(true);

    try {
      const res = await api.post(`/sessions/${session.id}/ask`, { question });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.answer, timestamp: new Date() }]);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to get AI response';
      toast.error(msg);
      if (err.response?.status === 403) {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: '⚠️ ' + msg + '\n\nPlease purchase a plan to continue.',
          timestamp: new Date(),
        }]);
      }
    } finally {
      setSending(false);
    }
  };

  const endSession = async () => {
    if (!session) return;
    if (!confirm('End this session?')) return;
    setEnding(true);
    try {
      await api.post(`/sessions/${session.id}/end`);
      setSession((prev) => ({ ...prev, status: 'ENDED' }));
      setSessions((prev) => prev.map((s) => s.id === session.id ? { ...s, status: 'ENDED' } : s));
      toast.success('Session ended.');
    } catch {
      toast.error('Failed to end session');
    } finally {
      setEnding(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex gap-6 h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
        <button
          onClick={() => setShowNewSession(!showNewSession)}
          className="btn-primary flex items-center justify-center gap-2 w-full"
        >
          <Plus className="w-4 h-4" />
          New Session
        </button>

        {showNewSession && (
          <div className="card p-4 space-y-3">
            <input
              className="input-field text-sm"
              placeholder="Session title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button
              onClick={startSession}
              disabled={starting}
              className="btn-primary w-full text-sm flex items-center justify-center gap-2"
            >
              {starting ? <Loader className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
              {starting ? 'Starting...' : 'Start'}
            </button>
          </div>
        )}

        <div className="card flex-1 overflow-y-auto p-0">
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sessions</p>
          </div>
          {loadingSessions ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : sessions.length === 0 ? (
            <p className="p-4 text-xs text-gray-400 text-center">No sessions yet</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => loadSession(s)}
                  className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors ${
                    session?.id === s.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      s.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                    <p className="text-xs font-medium text-gray-800 truncate">{s.title}</p>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 ml-3.5">
                    {new Date(s.created_at).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col card p-0 overflow-hidden">
        {!session ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="bg-blue-100 p-4 rounded-2xl mb-4">
              <Mic className="w-10 h-10 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Start an Interview Session</h2>
            <p className="text-gray-500 text-sm mb-6">
              Click "New Session" to begin your AI-powered mock interview.
            </p>
            <button
              onClick={() => setShowNewSession(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Session
            </button>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
              <div>
                <p className="font-semibold text-gray-900 text-sm">{session.title}</p>
                <p className={`text-xs ${session.status === 'ACTIVE' ? 'text-green-600' : 'text-gray-400'}`}>
                  {session.status === 'ACTIVE' ? '● Live Session' : '● Ended'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate(`/report/${session.id}`)}
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors font-medium"
                >
                  <FileBarChart className="w-4 h-4" />
                  Report
                </button>
                {session.status === 'ACTIVE' && (
                  <button
                    onClick={endSession}
                    disabled={ending}
                    className="flex items-center gap-1.5 text-sm text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    {ending ? <Loader className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
                    End Session
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              {messages.map((m, i) => (
                <Message key={i} role={m.role} content={m.content} timestamp={m.timestamp} />
              ))}
              {sending && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-gray-600" />
                  </div>
                  <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            {session.status === 'ACTIVE' ? (
              <div className="p-4 bg-white border-t border-gray-200">
                <div className="flex gap-3">
                  <textarea
                    className="input-field resize-none flex-1 text-sm min-h-[44px] max-h-32"
                    placeholder="Ask an interview question... (Enter to send, Shift+Enter for new line)"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={sending || !input.trim()}
                    className="btn-primary px-4 flex-shrink-0 flex items-center gap-2"
                  >
                    {sending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center gap-2 text-sm text-gray-500">
                <AlertCircle className="w-4 h-4" />
                This session has ended.{' '}
                <button onClick={() => { setSession(null); setMessages([]); setShowNewSession(true); }}
                  className="text-blue-600 font-medium hover:underline">
                  Start a new session
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
