import React from 'react';
import { useScope } from '../context/ScopeContext';
import { useGroups } from '../hooks/useGroups';
import { User, Users } from 'lucide-react';

export const ScopeToggle: React.FC = () => {
  const { context, groupId, setScope } = useScope();
  const { groups } = useGroups();

  return (
    <div className="flex items-center gap-1 p-1 rounded-full bg-slate-900/70 border border-white/15 shadow-sm backdrop-blur-xl">
      <button
        onClick={() => setScope('user')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
          context === 'user'
            ? 'bg-white text-slate-950 shadow-sm font-bold'
            : 'text-slate-400 hover:text-white hover:bg-white/10'
        }`}
      >
        <User className="w-3.5 h-3.5" />
        <span>Personal</span>
      </button>

      {groups.length > 0 ? (
        <div className="relative group">
          <button
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              context === 'group'
                ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-sm font-bold'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Squad</span>
          </button>

          <div className="absolute right-0 top-full mt-2 w-48 bg-slate-950/95 border border-white/15 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-1.5 backdrop-blur-2xl">
            {groups.map((g) => (
              <button
                key={g._id}
                onClick={() => setScope('group', g._id)}
                className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-colors ${
                  context === 'group' && groupId === g._id
                    ? 'bg-amber-500/20 text-amber-300 font-bold'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setScope('user')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors"
          title="Squad Ledger"
        >
          <Users className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Squad</span>
        </button>
      )}
    </div>
  );
};

