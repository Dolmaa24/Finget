import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { groupApi, type Scope, type ScopeRef } from '../api';
import { useAuth } from './authStore';
import { ScopeContext, SCOPE_STORAGE_KEY, type ScopeContextType } from './scopeStore';

function readStored(): { context: Scope; groupId: string | null } {
  try {
    const raw = localStorage.getItem(SCOPE_STORAGE_KEY);
    if (!raw) return { context: 'user', groupId: null };
    const parsed = JSON.parse(raw) as { context?: Scope; groupId?: string | null };
    return {
      context: parsed.context === 'group' ? 'group' : 'user',
      groupId: parsed.groupId || null,
    };
  } catch {
    return { context: 'user', groupId: null };
  }
}

export const ScopeProvider = ({ children }: { children: ReactNode }) => {
  const { token } = useAuth();
  const [stored] = useState(readStored);

  const [context, setContext] = useState<Scope>(stored.context);
  const [groupId, setGroupId] = useState<string | null>(stored.groupId);
  const [groups, setGroups] = useState<ScopeContextType['groups']>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [revision, setRevision] = useState(0);

  const setScope = useCallback((nextContext: Scope, nextGroupId: string | null = null) => {
    const resolvedGroupId = nextContext === 'group' ? nextGroupId : null;
    setContext(nextContext);
    setGroupId(resolvedGroupId);
    try {
      localStorage.setItem(
        SCOPE_STORAGE_KEY,
        JSON.stringify({ context: nextContext, groupId: resolvedGroupId })
      );
    } catch {
      /* private browsing — in-memory state still works */
    }
  }, []);

  const reloadGroups = useCallback(async () => {
    if (!token) return [];
    setLoadingGroups(true);
    try {
      const data = await groupApi.list();
      setGroups(data);
      return data;
    } catch {
      setGroups([]);
      return [];
    } finally {
      setLoadingGroups(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setGroups([]);
      return;
    }
    void reloadGroups();
  }, [token, reloadGroups]);

  // If the stored group vanished (left, or deleted by another member), fall
  // back to Personal rather than firing 403s on every page.
  useEffect(() => {
    if (loadingGroups || context !== 'group' || !groupId) return;
    if (groups.length === 0) return;
    if (!groups.some((g) => g._id === groupId)) setScope('user');
  }, [groups, loadingGroups, context, groupId, setScope]);

  const group = useMemo(() => groups.find((g) => g._id === groupId) || null, [groups, groupId]);

  const toggleMode = useCallback(() => {
    if (context === 'group') {
      setScope('user');
    } else if (groups.length > 0) {
      const target =
        groupId && groups.some((g) => g._id === groupId) ? groupId : groups[0]._id;
      setScope('group', target);
    }
  }, [context, groups, groupId, setScope]);

  const bumpRevision = useCallback(() => setRevision((r) => r + 1), []);

  const scope = useMemo<ScopeRef>(
    () => ({ context, groupId: context === 'group' ? groupId : null }),
    [context, groupId]
  );

  const value = useMemo<ScopeContextType>(
    () => ({
      context,
      groupId: context === 'group' ? groupId : null,
      group,
      groups,
      loadingGroups,
      isFriends: context === 'group' && !!groupId,
      scope,
      setScope,
      toggleMode,
      reloadGroups,
      revision,
      bumpRevision,
    }),
    [
      context,
      groupId,
      group,
      groups,
      loadingGroups,
      scope,
      setScope,
      toggleMode,
      reloadGroups,
      revision,
      bumpRevision,
    ]
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
};
