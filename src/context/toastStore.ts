import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

export interface ToastContextType {
  toast: (message: string, tone?: ToastTone) => void;
}

export const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export const useToast = () => useContext(ToastContext);
