import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { FileBarChart, Download, ArrowLeft, Loader, MessageSquare, Calendar } from 'lucide-react';

export default function Report() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api.get(`/report/${sessionId}/preview`)
      .then((res) => setData(res.data))
      .catch(() => { toast.error('Failed to load report'); navigate('/interview'); })
      .finally(() => setLoading(false));
  }, [sessionId]);

  const download = async (format) => {
    setDownloading(true);
    try {
      const res = await api.get(`/report/${sessionId}/download?format=${format}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report_${sessionId}.${format === 'text' ? 'txt' : 'pdf'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Report downloaded as ${format.toUpperCase()}`);
    } catch {
      toast.error('Failed to download report');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const { session, logs } = data;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <button
        onClick={() => navigate('/interview')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Interviews
      </button>

      {/* Report Header */}
      <div className="card mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2.5 rounded-xl">
              <FileBarChart className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{session.title}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(session.start_time).toLocaleDateString('en-IN', {
                    year: 'numeric', month: 'long', day: 'numeric'
                  })}
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5" />
                  {logs.length} Q&A pairs
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  session.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {session.status}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => download('text')}
              disabled={downloading}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Download className="w-4 h-4" />
              TXT
            </button>
            <button
              onClick={() => download('pdf')}
              disabled={downloading}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              {downloading ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Q&A Logs */}
      {logs.length === 0 ? (
        <div className="card text-center py-12">
          <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No questions logged in this session yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {logs.map((log, i) => (
            <div key={log.id} className="card">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                  Q
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 mb-1">Question {i + 1}</p>
                  <p className="text-gray-900 font-medium text-sm leading-relaxed">{log.question}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 pl-0 border-t border-gray-100 pt-3">
                <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                  A
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 mb-1">AI Answer</p>
                  <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                    {log.answer || <span className="text-gray-400 italic">No answer recorded</span>}
                  </p>
                </div>
              </div>

              <p className="text-xs text-gray-300 mt-3 text-right">
                {new Date(log.created_at).toLocaleTimeString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
