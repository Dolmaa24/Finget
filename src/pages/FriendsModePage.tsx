import React, { useCallback, useState, useEffect } from 'react';
import { Users, Plus, UserPlus, Copy, Check } from 'lucide-react';
import { useGroups } from '../hooks/useGroups';
import { useScope } from '../context/ScopeContext';
import { useGroupSocket } from '../hooks/useGroupSocket';
import { getTransactions } from '../api';

export const FriendsModePage: React.FC = () => {
  const { groups, loading, createGroup, joinGroup, loadGroups } = useGroups();
  const { context, groupId, setScope } = useScope();
  const [name, setName] = useState('');
  const [joinId, setJoinId] = useState('');
  const [txCount, setTxCount] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refreshTx = useCallback(() => {
    if (context === 'group' && groupId) {
      getTransactions('group', groupId)
        .then((t: unknown[]) => setTxCount(t.length))
        .catch(console.error);
    }
  }, [context, groupId]);

  useGroupSocket(context === 'group' ? groupId : null, refreshTx);

  useEffect(() => {
    refreshTx();
  }, [refreshTx]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const g = await createGroup(name.trim());
    setName('');
    setScope('group', g._id);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinId.trim()) return;
    await joinGroup(joinId.trim());
    setJoinId('');
    loadGroups();
  };

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-amber-700 uppercase tracking-widest">
            COLLECTIVE SQUAD LEDGER
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[11px] font-semibold text-stone-500">FRIENDS CO-OP</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-display font-black tracking-tight text-stone-900">
          Squads & Collective Telemetry
        </h1>
        <p className="text-xs sm:text-sm text-stone-600 mt-1 font-medium">
          Split house expenses, plan group trips, and isolate joint liabilities with zero friction.
        </p>
      </div>

      {/* Scope State Display */}
      <div className="glass-card-frosted rounded-3xl p-6 sm:p-7 border border-white/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-stone-500">CURRENT OPERATIONAL SCOPE</p>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                context === 'group' ? 'bg-amber-600 animate-pulse' : 'bg-emerald-500'
              }`}
            />
            <h3 className="text-lg font-bold text-stone-900">
              {context === 'group' && groupId
                ? `Squad Network (${groupId.slice(-6)})`
                : 'Personal Autonomous Vault'}
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (context === 'user' && groups[0]) setScope('group', groups[0]._id);
            else setScope('user', null);
          }}
          className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all border ${
            context === 'group'
              ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
              : 'bg-white border-stone-200 text-stone-700 hover:text-stone-950 shadow-xs'
          }`}
        >
          {context === 'group' ? 'Switch to Personal Vault' : 'Activate Squad Mode'}
        </button>
      </div>

      {/* Active Squads List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-stone-500 uppercase tracking-widest">
            JOINED SQUADS ({groups.length})
          </h3>
          {context === 'group' && groupId && txCount !== null && (
            <span className="text-xs font-bold text-amber-700">
              Live Transactions: {txCount}
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs font-medium text-stone-500">Loading squad feeds...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {groups.map((g) => {
              const isSelected = groupId === g._id && context === 'group';

              return (
                <div
                  key={g._id}
                  className={`glass-card-frosted rounded-3xl p-5 border transition-all ${
                    isSelected
                      ? 'border-amber-400 bg-amber-50/90 shadow-xs ring-1 ring-amber-400'
                      : 'border-white/80 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2.5 rounded-2xl ${
                          isSelected
                            ? 'bg-amber-200/60 text-amber-800'
                            : 'bg-stone-100 text-stone-600'
                        }`}
                      >
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-stone-900">{g.name}</h4>
                        <p className="text-[10px] font-medium text-stone-500">
                          {g.members?.length || 1} Member{g.members?.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleCopy(g._id)}
                      className="p-1.5 rounded-xl bg-white border border-stone-200 text-stone-500 hover:text-stone-800 transition-colors shadow-xs"
                      title="Copy Squad ID Token"
                    >
                      {copiedId === g._id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <div className="pt-3 border-t border-stone-200/80 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-stone-400 truncate max-w-[140px]">
                      ID: {g._id}
                    </span>

                    <button
                      type="button"
                      onClick={() => setScope('group', g._id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                        isSelected
                          ? 'bg-stone-900 text-white shadow-xs'
                          : 'bg-white border border-stone-200 hover:bg-stone-50 text-stone-700'
                      }`}
                    >
                      {isSelected ? 'ACTIVE' : 'SELECT'}
                    </button>
                  </div>
                </div>
              );
            })}

            {groups.length === 0 && (
              <div className="col-span-full py-12 text-center rounded-3xl glass-card-frosted border border-dashed border-stone-300">
                <p className="text-xs font-medium text-stone-500">No squad memberships found. Deploy or join below.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Creation & Join Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Create Squad */}
        <form
          onSubmit={handleCreate}
          className="glass-card-frosted rounded-3xl p-6 border border-white/80 space-y-4 shadow-xs"
        >
          <div className="flex items-center gap-2 pb-3 border-b border-stone-200/80">
            <Plus className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-bold text-stone-900">Create New Squad</h3>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-stone-500 mb-1.5">
              Squad Designation Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Goa Trip 2026 or Flat 402"
              className="w-full bg-white border border-stone-200 rounded-2xl px-4 py-3 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-500 shadow-xs"
              required
            />
          </div>
          <button type="submit" className="dark-pill-btn w-full py-3 text-xs font-bold shadow-sm">
            Initialize Squad Ledger
          </button>
        </form>

        {/* Join Squad */}
        <form
          onSubmit={handleJoin}
          className="glass-card-frosted rounded-3xl p-6 border border-white/80 space-y-4 shadow-xs"
        >
          <div className="flex items-center gap-2 pb-3 border-b border-stone-200/80">
            <UserPlus className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-bold text-stone-900">Join Existing Squad</h3>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-stone-500 mb-1.5">
              Paste Squad ID Token
            </label>
            <input
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              placeholder="Paste Squad ID"
              className="w-full bg-white border border-stone-200 rounded-2xl px-4 py-3 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-500 shadow-xs"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 text-xs font-bold rounded-full bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 shadow-xs transition-all"
          >
            Connect to Squad Feed
          </button>
        </form>
      </div>
    </div>
  );
};


