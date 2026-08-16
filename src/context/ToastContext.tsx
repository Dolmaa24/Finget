import React, { useCallback, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { ToastContext, type Toast, type ToastTone } from './toastStore';

const TONE_ICON: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-safe" />,
  error: <AlertTriangle className="w-4 h-4 text-risk" />,
  info: <Info className="w-4 h-4 text-accent" />,
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, tone, message }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2.5 w-[min(360px,calc(100vw-3rem))]">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="glass-strong glass-sheen rounded-md px-4 py-3.5 flex items-start gap-3 animate-rise"
          >
            <span className="mt-0.5 shrink-0">{TONE_ICON[t.tone]}</span>
            <p className="text-sm text-ink flex-1 leading-snug">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="text-ink-4 hover:text-ink transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
