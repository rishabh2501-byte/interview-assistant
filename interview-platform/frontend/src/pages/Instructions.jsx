import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { BookOpen, Save, Trash2, Loader, Info } from 'lucide-react';

const EXAMPLES = [
  'Focus on system design and architecture questions.',
  'I am a backend developer with 3 years of experience in Java and Spring Boot.',
  'Ask me questions about data structures and algorithms at a medium difficulty level.',
  'Provide detailed explanations for each answer.',
];

export default function Instructions() {
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get('/instructions')
      .then((res) => {
        const c = res.data.instruction?.content || '';
        setContent(c);
        setSaved(c);
      })
      .catch(() => toast.error('Failed to load instructions'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error('Instructions cannot be empty');
      return;
    }
    setSaving(true);
    try {
      await api.post('/instructions', { content });
      setSaved(content);
      toast.success('Instructions saved!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Clear all instructions?')) return;
    setDeleting(true);
    try {
      await api.delete('/instructions');
      setContent('');
      setSaved('');
      toast.success('Instructions cleared');
    } catch {
      toast.error('Failed to delete instructions');
    } finally {
      setDeleting(false);
    }
  };

  const isDirty = content !== saved;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Personal Instructions</h1>
        <p className="text-gray-500 text-sm mt-1">
          Tell the AI about your background, preferences, and focus areas for interview preparation.
        </p>
      </div>

      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-gray-900">Your Instructions</h2>
          {isDirty && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full ml-auto">
              Unsaved changes
            </span>
          )}
        </div>

        {loading ? (
          <div className="h-40 bg-gray-100 rounded-lg animate-pulse" />
        ) : (
          <textarea
            className="input-field resize-none h-40 font-mono text-sm"
            placeholder="e.g. I am a senior backend developer. Focus on system design, distributed systems, and Java-related questions..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={2000}
          />
        )}

        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-gray-400">{content.length}/2000 characters</span>
        </div>

        <div className="flex gap-3 mt-4">
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Instructions'}
          </button>
          {saved && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-2 text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {deleting ? <Loader className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Examples */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4 text-blue-500" />
          <h2 className="font-semibold text-gray-900 text-sm">Example Instructions</h2>
        </div>
        <p className="text-xs text-gray-500 mb-3">Click to use as a starting point:</p>
        <div className="space-y-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => { setContent(ex); }}
              className="w-full text-left text-sm text-gray-700 p-3 rounded-lg bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border border-gray-200 hover:border-blue-200 transition-colors"
            >
              "{ex}"
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
