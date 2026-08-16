import React, { useEffect, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import { initials, hueFor } from '../../lib/format';
import { cn } from '../../lib/cn';

/* ============================================================
   Glass primitives — every panel in Finget is built from these.
   ============================================================ */

type Div = React.HTMLAttributes<HTMLDivElement>;

const cx = cn;

interface PanelProps extends Div {
  tone?: 'default' | 'strong' | 'soft';
  padded?: boolean;
  interactive?: boolean;
}

export const Panel: React.FC<PanelProps> = ({
  tone = 'default',
  padded = true,
  interactive = false,
  className,
  children,
  ...rest
}) => (
  <div
    className={cx(
      tone === 'strong' ? 'glass-strong' : tone === 'soft' ? 'glass-soft' : 'glass',
      'glass-sheen rounded-lg',
      padded && 'p-6',
      interactive && 'lift',
      className
    )}
    {...rest}
  >
    {children}
  </div>
);

/* ---------------------------------------------------------- */

type ButtonVariant = 'primary' | 'glass' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--accent-ink)] border border-transparent shadow-soft hover:bg-[var(--accent-soft)]',
  glass:
    'glass text-ink hover:bg-[var(--glass-strong)] border border-[var(--glass-border)]',
  ghost: 'text-ink-2 hover:text-ink hover:bg-white/40 border border-transparent',
  danger:
    'bg-[var(--risk)] text-white border border-transparent shadow-soft hover:opacity-90',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-7 text-base gap-2.5 py-3.5',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}) => (
  <button
    className={cx(
      'inline-flex items-center justify-center rounded-pill font-semibold',
      'transition-all duration-200 ease-spatial active:scale-[0.97]',
      'disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
      BUTTON_VARIANTS[variant],
      BUTTON_SIZES[size],
      className
    )}
    disabled={disabled || loading}
    {...rest}
  >
    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
    {children}
  </button>
);

/* ---------------------------------------------------------- */

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, hint, error, className, children }) => (
  <label className={cx('block', className)}>
    {label && (
      <span className="block text-[12px] font-semibold text-ink-2 mb-1.5">{label}</span>
    )}
    {children}
    {error ? (
      <span className="block text-[12px] text-risk mt-1.5">{error}</span>
    ) : hint ? (
      <span className="block text-[12px] text-ink-3 mt-1.5">{hint}</span>
    ) : null}
  </label>
);

const CONTROL_BASE =
  'w-full glass-well rounded-sm px-4 h-11 text-sm text-ink placeholder:text-ink-4 ' +
  'outline-none transition-all duration-200 focus:bg-white/50 ' +
  'focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-wash)]';

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...rest
}) => <input className={cx(CONTROL_BASE, className)} {...rest} />;

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className,
  children,
  ...rest
}) => (
  <select className={cx(CONTROL_BASE, 'cursor-pointer appearance-none pr-9', className)} {...rest}>
    {children}
  </select>
);

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  className,
  ...rest
}) => (
  <textarea
    className={cx(CONTROL_BASE, 'h-auto py-3 resize-y min-h-[88px]', className)}
    {...rest}
  />
);

/** Currency input with a permanent ₹ adornment. */
export const MoneyInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...rest
}) => (
  <div className="relative">
    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none select-none">
      ₹
    </span>
    <input
      type="number"
      inputMode="decimal"
      className={cx(CONTROL_BASE, 'pl-9 numeric', className)}
      {...rest}
    />
  </div>
);

/* ---------------------------------------------------------- */

type Tone = 'neutral' | 'accent' | 'safe' | 'warn' | 'risk';

const TONE_STYLES: Record<Tone, string> = {
  neutral: 'bg-white/50 text-ink-2',
  accent: 'bg-[var(--accent-wash)] text-accent',
  safe: 'bg-[var(--safe-wash)] text-safe',
  warn: 'bg-[var(--warn-wash)] text-warn',
  risk: 'bg-[var(--risk-wash)] text-risk',
};

export const Badge: React.FC<{
  tone?: Tone;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ tone = 'neutral', icon, className, children }) => (
  <span
    className={cx(
      'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-semibold',
      TONE_STYLES[tone],
      className
    )}
  >
    {icon}
    {children}
  </span>
);

/* ---------------------------------------------------------- */

export const Progress: React.FC<{
  value: number;
  tone?: Tone;
  className?: string;
  height?: number;
}> = ({ value, tone = 'accent', className, height = 8 }) => {
  const fill =
    tone === 'safe'
      ? 'var(--safe)'
      : tone === 'warn'
        ? 'var(--warn)'
        : tone === 'risk'
          ? 'var(--risk)'
          : 'var(--accent)';

  return (
    <div
      className={cx('glass-well rounded-pill overflow-hidden w-full', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-pill transition-[width] duration-700 ease-spatial"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: `linear-gradient(90deg, ${fill}, color-mix(in srgb, ${fill} 65%, white))`,
        }}
      />
    </div>
  );
};

/* ---------------------------------------------------------- */

export const Avatar: React.FC<{
  name?: string;
  size?: number;
  className?: string;
}> = ({ name, size = 36, className }) => {
  const hue = hueFor(name || 'anon');
  return (
    <span
      className={cx(
        'inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0',
        'border border-white/60 shadow-soft select-none',
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(140deg, hsl(${hue} 55% 62%), hsl(${(hue + 40) % 360} 58% 52%))`,
      }}
      title={name}
    >
      {initials(name)}
    </span>
  );
};

/* ---------------------------------------------------------- */

export const SegmentedControl = <T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  className?: string;
}) => (
  <div className={cx('glass-well rounded-pill p-1 inline-flex gap-1', className)}>
    {options.map((opt) => {
      const active = opt.value === value;
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={active}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-pill px-3.5 h-8 text-[13px] font-semibold',
            'transition-all duration-250 ease-spatial',
            active
              ? 'bg-white/85 text-ink shadow-soft'
              : 'text-ink-3 hover:text-ink-2'
          )}
        >
          {opt.icon}
          {opt.label}
        </button>
      );
    })}
  </div>
);

/* ---------------------------------------------------------- */

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  width?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, width = 'max-w-lg', children }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Stop the page behind the sheet from scrolling.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-[rgb(60_48_38/0.38)] backdrop-blur-md"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={cx(
          'relative w-full glass-modal glass-sheen rounded-xl overflow-hidden animate-pop',
          width
        )}
      >
        {(title || subtitle) && (
          <div className="px-7 pt-7 pb-5 border-b border-white/50">
            {title && <h2 className="text-xl font-semibold text-ink tracking-tight">{title}</h2>}
            {subtitle && <p className="text-sm text-ink-3 mt-1">{subtitle}</p>}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 p-2 rounded-pill text-ink-3 hover:text-ink hover:bg-white/60 transition-colors"
        >
          <X className="w-4.5 h-4.5" strokeWidth={2} />
        </button>
        <div className="px-7 py-6 max-h-[70vh] overflow-y-auto scroll-slim">{children}</div>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------- */

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon, title, body, action, className }) => (
  <div
    className={cx(
      'flex flex-col items-center justify-center text-center py-14 px-6',
      'rounded-lg border border-dashed border-white/70 bg-white/25',
      className
    )}
  >
    {icon && (
      <div className="w-14 h-14 rounded-full glass flex items-center justify-center text-ink-3 mb-4">
        {icon}
      </div>
    )}
    <p className="font-semibold text-ink">{title}</p>
    {body && <p className="text-sm text-ink-3 mt-1.5 max-w-sm leading-relaxed">{body}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

/* ---------------------------------------------------------- */

export const Spinner: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cx('flex items-center justify-center py-16', className)}>
    <Loader2 className="w-7 h-7 animate-spin text-accent" />
  </div>
);

export const SkeletonPanel: React.FC<{ height?: number; className?: string }> = ({
  height = 140,
  className,
}) => (
  <div
    className={cx('skeleton rounded-lg border border-white/60', className)}
    style={{ height }}
  />
);

/* ---------------------------------------------------------- */

export const PageHeader: React.FC<{
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, subtitle, actions }) => (
  <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
    <div className="min-w-0">
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h1 className="display text-[34px] sm:text-[42px]">{title}</h1>
      {subtitle && <p className="text-ink-2 mt-2 max-w-2xl leading-relaxed">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
  </header>
);

/* ---------------------------------------------------------- */

/** Compact labelled figure used across dashboards. */
export const Stat: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  icon?: React.ReactNode;
}> = ({ label, value, sub, tone = 'neutral', icon }) => {
  const valueTone =
    tone === 'safe'
      ? 'text-safe'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'risk'
          ? 'text-risk'
          : tone === 'accent'
            ? 'text-accent'
            : 'text-ink';

  return (
    <div className="glass-well rounded-md p-4">
      <div className="flex items-center gap-1.5 mb-2">
        {icon && <span className="text-ink-3">{icon}</span>}
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label}</p>
      </div>
      <p className={cx('text-2xl font-semibold numeric', valueTone)}>{value}</p>
      {sub && <p className="text-[12px] text-ink-3 mt-1">{sub}</p>}
    </div>
  );
};
