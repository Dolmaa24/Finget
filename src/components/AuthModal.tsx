import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, Loader2 } from 'lucide-react';

interface Props {
  onClose: () => void;
  defaultTab?: 'login' | 'signup';
}

export const AuthModal: React.FC<Props> = ({ onClose, defaultTab = 'login' }) => {
  const [tab, setTab] = useState<'login' | 'signup'>(defaultTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setToken } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    monthlyIncome: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/signup';
    
    try {
      const payload: any = { email: formData.email, password: formData.password };
      if (tab === 'signup') {
        payload.name = formData.name;
        payload.monthlyIncome = Number(formData.monthlyIncome);
      }

      const res = await fetch(`http://localhost:5000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.msg || 'Something went wrong');
      }

      setToken(data.token);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy-900/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-navy-800 border border-slate-700 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
          <X className="w-6 h-6" />
        </button>

        <div className="px-8 pt-8 pb-6 flex border-b border-slate-700/50">
          <button 
            className={`flex-1 pb-4 text-lg font-semibold border-b-2 transition-colors ${tab === 'login' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
            onClick={() => { setTab('login'); setError(''); }}
          >
            Login
          </button>
          <button 
            className={`flex-1 pb-4 text-lg font-semibold border-b-2 transition-colors ${tab === 'signup' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
            onClick={() => { setTab('signup'); setError(''); }}
          >
            Sign Up
          </button>
        </div>

        <div className="p-8">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-xl mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
                <input 
                  type="text" required
                  className="w-full bg-navy-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email Address</label>
              <input 
                type="email" required
                className="w-full bg-navy-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <input 
                type="password" required
                className="w-full bg-navy-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}
              />
            </div>

            {tab === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Monthly Income (₹)</label>
                <input 
                  type="number" required min="0" step="1000"
                  className="w-full bg-navy-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  value={formData.monthlyIncome} onChange={e => setFormData({...formData, monthlyIncome: e.target.value})}
                />
              </div>
            )}

            <button 
              type="submit" disabled={loading}
              className="w-full py-4 mt-4 bg-primary hover:bg-emerald-400 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (tab === 'login' ? 'Login to Finget' : 'Create Account')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
