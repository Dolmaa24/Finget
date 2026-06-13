import React from 'react';
import { useScope } from '../context/ScopeContext';
import { useGroups } from '../hooks/useGroups';
import { User, Users } from 'lucide-react';

export const ScopeToggle: React.FC = () => {
  const { context, groupId, setScope } = useScope();
  const { groups, loading } = useGroups();

  return (
    <div className="fixed top-4 right-4 z-40 flex items-center gap-2 bg-navy-800/90 backdrop-blur-md p-1.5 rounded-full border border-slate-700/50 shadow-xl">
      <button
        onClick={() => setScope('user')}
        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
          context === 'user'
            ? 'bg-primary text-navy-950 shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <User className="w-4 h-4" />
        <span className="hidden sm:inline">Personal</span>
      </button>

      {groups.length > 0 ? (
        <div className="relative group">
          <button
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
              context === 'group'
                ? 'bg-primary text-navy-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Friends</span>
          </button>
          
          <div className="absolute right-0 top-full mt-2 w-48 bg-navy-800 border border-slate-700 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
            <div className="py-2">
              {groups.map(g => (
                <button
                  key={g._id}
                  onClick={() => setScope('group', g._id)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-700 transition-colors ${
                    context === 'group' && groupId === g._id ? 'text-primary font-bold' : 'text-slate-300'
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {}} // Could redirect to Friends mode setup
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all text-slate-500 cursor-not-allowed`}
          title="Create a group in Friends Mode first"
        >
          <Users className="w-4 h-4" />
          <span className="hidden sm:inline">Friends</span>
        </button>
      )}
    </div>
  );
};
