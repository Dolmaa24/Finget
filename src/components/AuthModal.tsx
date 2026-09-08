import { cn } from '../lib/cn';
import React, { useState } from 'react';
import { authApi } from '../api';
import { useAuth } from '../context/authStore';
import { Button, Field, Input, Modal, MoneyInput } from './ui';
import { GoogleLogin } from '@react-oauth/google';

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
      if (tab === 'signup') {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
        if (!emailRegex.test(form.email.trim())) {
          throw new Error('Please enter a valid Gmail address (e.g. user@gmail.com).');
        }

        const pwd = form.password;
        if (pwd.length <= 6) {
          throw new Error('Password must be more than 6 characters.');
        }
        if (!/[A-Z]/.test(pwd)) {
          throw new Error('Password must contain at least one uppercase (capital) letter.');
        }
        if (!/[a-z]/.test(pwd)) {
          throw new Error('Password must contain at least one lowercase (small) letter.');
        }
        if (!/[0-9]/.test(pwd)) {
          throw new Error('Password must contain at least one number.');
        }
      }

      const normalizedEmail = form.email.trim().toLowerCase();

      const result =
        tab === 'login'
          ? await authApi.login({ email: normalizedEmail, password: form.password })
          : await authApi.signup({
              name: form.name,
              email: normalizedEmail,
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

      <div className="flex justify-center mb-6">
        <GoogleLogin
          onSuccess={async (credentialResponse) => {
            if (!credentialResponse.credential) return;
            setLoading(true);
            setError('');
            try {
              const result = await authApi.google({ token: credentialResponse.credential });
              signIn(result.token, result.user);
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Google authentication failed');
            } finally {
              setLoading(false);
            }
          }}
          onError={() => setError('Google authentication failed')}
          useOneTap
        />
      </div>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/20"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 text-ink-3" style={{ background: 'var(--bg-app, transparent)' }}>Or continue with email</span>
        </div>
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
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>

        <Field
          label="Password"
          hint={
            tab === 'signup'
              ? 'Must be more than 6 characters and contain uppercase, lowercase, and numbers.'
              : undefined
          }
        >
          <Input
            type="password"
            value={form.password}
            onChange={set('password')}
            required
            minLength={tab === 'signup' ? 7 : undefined}
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
