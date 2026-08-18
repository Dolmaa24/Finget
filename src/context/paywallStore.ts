import { createContext, useContext } from 'react';
import type { ApiError } from '../api';

export interface PaywallContextType {
  /**
   * Raise the sheet for a refusal that already happened.
   *
   * Takes the ApiError itself, so a call site does not have to know which
   * capability it just touched — the server said, and `api()` carried it
   * through on the error.
   *
   * @returns true if the sheet was raised, false if this was not a paywall
   *   error and the caller should handle it normally (a toast, usually).
   */
  showPaywallFor: (error: unknown, context?: { groupId?: string; groupName?: string }) => boolean;

  /** Raise it deliberately, for a feature the UI knows is gated before trying. */
  showPaywall: (args: {
    reason: string;
    capability?: string;
    groupId?: string;
    groupName?: string;
    usage?: { current: number; limit: number } | null;
  }) => void;
}

export const PaywallContext = createContext<PaywallContextType | undefined>(undefined);

export const usePaywall = () => {
  const ctx = useContext(PaywallContext);
  if (!ctx) throw new Error('usePaywall must be used within a PaywallProvider');
  return ctx;
};

/** Capabilities a group's Trip Pass can grant, mirroring GROUP_GRANTABLE. */
export const GROUP_GRANTABLE = new Set([
  'unlimited_coach',
  'import_screenshot',
  'import_sms',
  'wrapped_export',
  'weighted_splits',
]);

export const isPaywallError = (error: unknown): error is ApiError =>
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  (error as ApiError).status === 403 &&
  Boolean((error as ApiError).capability);
