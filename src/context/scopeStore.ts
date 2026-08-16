import { createContext, useContext } from 'react';
import type { Group, Scope, ScopeRef } from '../api';

export interface ScopeContextType {
  /** 'user' = Personal mode, 'group' = Friends mode. */
  context: Scope;
  groupId: string | null;
  /** The active group object when in Friends mode. */
  group: Group | null;
  groups: Group[];
  loadingGroups: boolean;
  isFriends: boolean;
  /** Convenience object accepted by every api helper. */
  scope: ScopeRef;
  setScope: (context: Scope, groupId?: string | null) => void;
  /** Flip to Friends mode, picking the first group when none is chosen. */
  toggleMode: () => void;
  reloadGroups: () => Promise<Group[]>;
  /** Bumped whenever live group data changes, so views can re-fetch. */
  revision: number;
  bumpRevision: () => void;
}

export const ScopeContext = createContext<ScopeContextType | undefined>(undefined);

export const useScope = () => {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope must be used within a ScopeProvider');
  return ctx;
};

export const SCOPE_STORAGE_KEY = 'finget_scope';
