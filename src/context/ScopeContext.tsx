import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

const STORAGE_KEY = 'finget_scope';

type ContextScope = 'user' | 'group';

interface ScopeContextType {
  context: ContextScope;
  groupId: string | null;
  setScope: (context: ContextScope, groupId?: string | null) => void;
}

const ScopeContext = createContext<ScopeContextType>({
  context: 'user',
  groupId: null,
  setScope: () => {},
});

export const useScope = () => useContext(ScopeContext);

function readStored(): { context: ContextScope; groupId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { context: 'user', groupId: null };
    const parsed = JSON.parse(raw) as { context?: ContextScope; groupId?: string | null };
    const context = parsed.context === 'group' ? 'group' : 'user';
    return { context, groupId: parsed.groupId || null };
  } catch {
    return { context: 'user', groupId: null };
  }
}

export const ScopeProvider = ({ children }: { children: ReactNode }) => {
  const [context, setContext] = useState<ContextScope>(() => readStored().context);
  const [groupId, setGroupId] = useState<string | null>(() => readStored().groupId);

  const setScope = useCallback((newContext: ContextScope, newGroupId: string | null = null) => {
    setContext(newContext);
    setGroupId(newGroupId);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ context: newContext, groupId: newGroupId })
      );
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <ScopeContext.Provider value={{ context, groupId, setScope }}>
      {children}
    </ScopeContext.Provider>
  );
};
