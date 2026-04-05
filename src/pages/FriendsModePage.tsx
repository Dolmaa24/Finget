import React, { useCallback, useState, useEffect } from 'react';
import { Users, Plus, UserPlus } from 'lucide-react';
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

  return (
    <div className="animate-in fade-in max-w-3xl mx-auto space-y-10">
      <div>
        <h1 className="text-3xl font-black text-white mb-2 flex items-center gap-2">
          <Users className="w-8 h-8 text-primary" />
          Friends mode & groups
        </h1>
        <p className="text-slate-400">
          Explicit scope: APIs use <code className="text-primary">context=user</code> or{' '}
          <code className="text-primary">context=group&groupId=…</code> — no hidden global switching.
        </p>
      </div>

      <div className="flex items-center justify-between bg-navy-800 rounded-2xl p-4 border border-slate-700/50">
        <div>
          <p className="text-sm text-slate-400">Active scope</p>
          <p className="text-lg font-bold text-white">
            {context === 'group' && groupId ? `Group · ${groupId.slice(-6)}` : 'Personal'}
          </p>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <span className="text-sm text-slate-400">Friends mode</span>
          <button
            type="button"
            onClick={() => {
              if (context === 'user' && groups[0]) setScope('group', groups[0]._id);
              else setScope('user', null);
            }}
            className={`relative w-14 h-8 rounded-full transition-colors ${
              context === 'group' ? 'bg-primary' : 'bg-slate-700'
            }`}
          >
            <span
              className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                context === 'group' ? 'left-7' : 'left-1'
              }`}
            />
          </button>
        </label>
      </div>

      {context === 'group' && groupId && txCount !== null && (
        <p className="text-sm text-slate-400">
          Shared transactions in this group: <strong className="text-white">{txCount}</strong> (updates live when
          members add expenses).
        </p>
      )}

      {loading ? (
        <p className="text-slate-500">Loading groups…</p>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-200">Your groups</h2>
          <div className="space-y-2">
            {groups.map((g) => (
              <button
                key={g._id}
                type="button"
                onClick={() => setScope('group', g._id)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                  groupId === g._id
                    ? 'border-primary bg-primary/10 text-white'
                    : 'border-slate-700 bg-navy-800 text-slate-300 hover:border-slate-600'
                }`}
              >
                <span className="font-medium">{g.name}</span>
                <span className="text-xs text-slate-500 ml-2">
                  {g.members?.length || 0} members
                </span>
              </button>
            ))}
            {groups.length === 0 && (
              <p className="text-slate-500 text-sm">Create or join a group to collaborate.</p>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="bg-navy-800 rounded-2xl p-6 border border-slate-700/50 space-y-4">
        <h3 className="font-semibold text-slate-100 flex items-center gap-2">
          <Plus className="w-5 h-5 text-primary" /> Create group
        </h3>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Family trip fund"
          className="w-full bg-navy-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white"
        />
        <button
          type="submit"
          className="bg-primary text-navy-950 font-bold px-6 py-2 rounded-xl"
        >
          Create
        </button>
      </form>

      <form onSubmit={handleJoin} className="bg-navy-800 rounded-2xl p-6 border border-slate-700/50 space-y-4">
        <h3 className="font-semibold text-slate-100 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-primary" /> Join with group ID
        </h3>
        <input
          value={joinId}
          onChange={(e) => setJoinId(e.target.value)}
          placeholder="Paste MongoDB ObjectId"
          className="w-full bg-navy-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white font-mono"
        />
        <button
          type="submit"
          className="border border-slate-600 text-slate-200 font-medium px-6 py-2 rounded-xl hover:bg-navy-900"
        >
          Join
        </button>
      </form>
    </div>
  );
};
