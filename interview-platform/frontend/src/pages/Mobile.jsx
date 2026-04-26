import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mic, Camera, Trash2, Wifi, WifiOff, Loader2 } from 'lucide-react';

// Dual-device MOBILE receiver.
// URL: /mobile?token=<one-shot pairing token from the desktop>
//
// - Opens a WebSocket to the same host on port 5000 (/ws).
// - Sends { type:'hello', role:'mobile', pairingToken } immediately.
// - Renders streamed answer tokens in real time, dark "stealth" theme.
// - Two big action buttons that send trigger:answer / trigger:screenshot
//   back to the paired desktop so the user can drive everything from
//   the phone.

const WS_URL =
  import.meta.env.VITE_BACKEND_WS ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:5000/ws`;

export default function Mobile() {
  const [params] = useSearchParams();
  const token = params.get('token');

  const [connected, setConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [status, setStatus] = useState('Connecting…');
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(token ? null : 'Missing pairing token in URL.');

  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const scrollRef = useRef(null);

  const connect = () => {
    if (!token) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'hello', role: 'mobile', pairingToken: token }));
      };
      ws.onmessage = (evt) => {
        let msg;
        try { msg = JSON.parse(evt.data); } catch { return; }
        handleMessage(msg);
      };
      ws.onclose = () => {
        setConnected(false);
        setPeerConnected(false);
        setStatus('Disconnected. Reconnecting…');
        scheduleReconnect();
      };
      ws.onerror = () => {};
    } catch (e) {
      scheduleReconnect();
    }
  };

  const scheduleReconnect = () => {
    if (reconnectTimer.current) return;
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      connect();
    }, 2000);
  };

  const handleMessage = (msg) => {
    switch (msg.type) {
      case 'ready':
        setConnected(true);
        setPeerConnected(!!msg.peerConnected);
        setStatus(msg.peerConnected ? 'Paired with desktop' : 'Waiting for desktop…');
        setError(null);
        break;
      case 'peer-joined':
        if (msg.role === 'desktop') {
          setPeerConnected(true);
          setStatus('Paired with desktop');
        }
        break;
      case 'peer-left':
        if (msg.role === 'desktop') {
          setPeerConnected(false);
          setStatus('Desktop disconnected');
        }
        break;
      case 'answer:start':
        setAnswer('');
        setStreaming(true);
        setStatus(msg.meta?.kind === 'screenshot' ? 'Analyzing screenshot…' : 'Answering…');
        break;
      case 'answer:token':
        if (typeof msg.fullText === 'string') setAnswer(msg.fullText);
        else if (typeof msg.delta === 'string') setAnswer(prev => prev + msg.delta);
        break;
      case 'answer:done':
        if (typeof msg.fullText === 'string' && msg.fullText.length) setAnswer(msg.fullText);
        setStreaming(false);
        setStatus('Done');
        break;
      case 'status':
        setStatus(msg.text || '');
        break;
      case 'error':
        setError(msg.error || 'Server error');
        break;
    }
  };

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
      if (wsRef.current) { try { wsRef.current.close(); } catch {} }
    };
    // eslint-disable-next-line
  }, []);

  // Auto-scroll to bottom while streaming, unless user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (stickToBottom) el.scrollTop = el.scrollHeight;
  }, [answer]);

  const send = (type, payload) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify({ type, ...(payload || {}) })); } catch {}
  };

  const triggerAnswer     = () => { if (peerConnected) send('trigger:answer'); };
  const triggerScreenshot = () => { if (peerConnected) send('trigger:screenshot'); };
  const triggerClear      = () => { if (peerConnected) send('trigger:clear'); setAnswer(''); };

  const rendered = useMemo(() => formatAnswer(answer), [answer]);

  return (
    <div className="fixed inset-0 bg-[#0a0a0b] text-zinc-100 flex flex-col font-['-apple-system,BlinkMacSystemFont,Inter,sans-serif']">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/60 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gradient-to-br from-white to-zinc-400 shadow-[0_0_10px_rgba(255,255,255,0.3)]" />
          <span className="text-sm font-semibold tracking-tight">Interview Assistant</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
          {connected ? (
            <span className={`flex items-center gap-1 ${peerConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
              {peerConnected ? <Wifi className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {peerConnected ? 'Paired' : 'Waiting'}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-rose-400">
              <WifiOff className="w-3.5 h-3.5" />
              Offline
            </span>
          )}
        </div>
      </header>

      {/* Status strip */}
      <div className="px-4 py-2 border-b border-white/5 text-[11px] text-zinc-400 flex items-center gap-2">
        {streaming && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
        <span>{error ? <span className="text-rose-400">{error}</span> : status}</span>
      </div>

      {/* Answer area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 text-[15px] leading-[1.62] tracking-[-0.003em]"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {answer ? (
          <div dangerouslySetInnerHTML={{ __html: rendered }} />
        ) : (
          <div className="text-zinc-500 italic text-sm mt-10 text-center">
            {peerConnected
              ? 'Tap Answer or Screenshot below — the reply will stream here.'
              : error ? null : 'Waiting for the desktop to connect…'}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="grid grid-cols-3 gap-2 p-3 border-t border-white/10 bg-black/60 backdrop-blur">
        <button
          onClick={triggerAnswer}
          disabled={!peerConnected}
          className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl
                     bg-white text-black font-semibold text-sm
                     active:scale-[0.98] transition
                     disabled:opacity-30 disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          <Mic className="w-5 h-5" />
          Answer
        </button>
        <button
          onClick={triggerScreenshot}
          disabled={!peerConnected}
          className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl
                     bg-zinc-900 border border-white/10 text-zinc-100 font-semibold text-sm
                     active:scale-[0.98] transition
                     disabled:opacity-30"
        >
          <Camera className="w-5 h-5" />
          Screenshot
        </button>
        <button
          onClick={triggerClear}
          disabled={!peerConnected}
          className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl
                     bg-zinc-900 border border-white/10 text-zinc-400 font-semibold text-sm
                     active:scale-[0.98] transition
                     disabled:opacity-30"
        >
          <Trash2 className="w-5 h-5" />
          Clear
        </button>
      </div>

      {/* Local styles to mirror desktop highlighting classes */}
      <style>{`
        .mob-highlight { color:#fde68a; background:rgba(251,191,36,0.1); padding:0 4px; border-radius:3px; font-weight:500; }
        .mob-key      { color:#bfdbfe; font-weight:600; }
        .mob-code     { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size:13px; padding:1px 5px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); border-radius:4px; color:#e4e4e7; }
        .mob-pre      { margin:12px 0; background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.1); border-radius:10px; overflow:hidden; }
        .mob-pre-h    { padding:6px 12px; background:rgba(255,255,255,0.04); border-bottom:1px solid rgba(255,255,255,0.08); font-size:10px; text-transform:uppercase; letter-spacing:0.1em; color:rgba(255,255,255,0.5); font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
        .mob-pre-c    { padding:12px; margin:0; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size:12.5px; line-height:1.55; color:#e4e4e7; overflow-x:auto; white-space:pre; }
      `}</style>
    </div>
  );
}

// Minimal markdown-ish formatter matching the desktop's highlightImportantParts.
// Handles fenced code blocks, **bold**, `inline code`, and bullet key-terms.
function formatAnswer(text) {
  if (!text) return '';
  const codeBlocks = [];
  let t = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: (lang || 'code').toUpperCase(), code: code.trim() });
    return `__CB_${idx}__`;
  });

  // Escape minimal HTML
  t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Inline code
  t = t.replace(/`([^`]+)`/g, '<span class="mob-code">$1</span>');
  // Bold
  t = t.replace(/\*\*([^*]+)\*\*/g, '<span class="mob-highlight">$1</span>');
  // Newlines → <br>
  t = t.replace(/\n/g, '<br>');
  // Bullet key-term (text before colon right after "- ")
  t = t.replace(/(<br>[-•]\s*)([^:<]+):/g, '$1<span class="mob-key">$2</span>:');

  // Restore code blocks
  codeBlocks.forEach((b, i) => {
    const safe = b.code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<div class="mob-pre"><div class="mob-pre-h">${b.lang}</div><pre class="mob-pre-c">${safe}</pre></div>`;
    t = t.replace(`__CB_${i}__`, html);
  });
  return t;
}
