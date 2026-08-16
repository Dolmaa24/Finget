import { cn } from '../lib/cn';
import React, { useState } from 'react';
import { authApi } from '../api';
import { useAuth } from '../context/authStore';
import { Button, Field, Input, Modal, MoneyInput } from './ui';

export const AuthModal: React.FC<{
  open: boolean;
  onClose: () => void;
  defaultTab?: 'login' | 'signup';
}> = ({ open, onClose, defaultTab = 'login' }) => {
  const { signIn } = useAuth();
  const [tab, setTab] = useState<'login' | 'signup'>(defaultTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', monthlyIncome: '' });

  React.useEffect(() => {
    if (open) {
      setTab(defaultTab);
      setError('');
    }
  }, [open, defaultTab]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result =
        tab === 'login'
          ? await authApi.login({ email: form.email, password: form.password })
          : await authApi.signup({
              name: form.name,
              email: form.email,
              password: form.password,
              monthlyIncome: Number(form.monthlyIncome) || 0,
            });

      signIn(result.token, result.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tab === 'login' ? 'Welcome back' : 'Create your account'}
      subtitle={
        tab === 'login'
          ? 'Pick up where you left off.'
          : 'Two minutes to your first safe-to-spend number.'
      }
    >
      <div className="glass-well rounded-pill p-1 flex mb-6">
        {(['login', 'signup'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setError('');
            }}
            className={cn(
              'flex-1 h-9 rounded-pill text-[13px] font-semibold transition-all duration-250',
              tab === t ? 'bg-white/85 text-ink shadow-soft' : 'text-ink-3 hover:text-ink-2'
            )}
          >
            {t === 'login' ? 'Log in' : 'Sign up'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {tab === 'signup' && (
          <Field label="Full name">
            <Input value={form.name} onChange={set('name')} required autoComplete="name" />
          </Field>
        )}

        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={set('email')}
            required
            autoComplete="email"
          />
        </Field>

        <Field label="Password" hint={tab === 'signup' ? 'At least 6 characters.' : undefined}>
          <Input
            type="password"
            value={form.password}
            onChange={set('password')}
            required
            minLength={tab === 'signup' ? 6 : undefined}
            autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
          />
        </Field>

        {tab === 'signup' && (
          <Field
            label="Monthly income"
            hint="Used to work out what is genuinely safe to spend. You can change it later."
          >
            <MoneyInput
              value={form.monthlyIncome}
              onChange={set('monthlyIncome')}
              min="0"
              required
              placeholder="50000"
            />
          </Field>
        )}

        {error && (
          <p className="text-sm text-risk bg-[var(--risk-wash)] rounded-sm px-3.5 py-2.5">{error}</p>
        )}

        <Button type="submit" loading={loading} size="lg" className="w-full !mt-6">
          {tab === 'login' ? 'Log in' : 'Create account'}
        </Button>
      </form>
    </Modal>
  );
};
