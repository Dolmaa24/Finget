import React, { useState } from 'react';
import { useGoals, type Goal } from '../hooks/useGoals';
import { Target, TrendingUp, AlertCircle, Plus, Trash2, GripVertical } from 'lucide-react';
import { useScope } from '../context/ScopeContext';

export const GoalsPage: React.FC = () => {
  const { context, groupId } = useScope();
  const { goals, loading, addGoal, updateGoal, deleteGoal, loadGoals } = useGoals({
    context,
    groupId: groupId || undefined,
  });
  const [newGoal, setNewGoal] = useState({ name: '', targetAmount: '', deadline: '' });
  const [addingFundsTo, setAddingFundsTo] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.name || !newGoal.targetAmount) return;
    await addGoal({
      name: newGoal.name,
      targetAmount: Number(newGoal.targetAmount),
      deadline: newGoal.deadline || undefined,
      priority: 'Medium',
    });
    setNewGoal({ name: '', targetAmount: '', deadline: '' });
  };

  const handleAddFunds = async (goal: Goal) => {
    const amount = Number(fundAmount);
    if (amount > 0) {
      await updateGoal(goal._id, { currentAmount: (goal.currentAmount || 0) + amount });
    }
    setAddingFundsTo(null);
    setFundAmount('');
  };

  const togglePriority = async (goal: Goal) => {
    const nextPriority = goal.priority === 'High' ? 'Medium' : goal.priority === 'Medium' ? 'Low' : 'High';
    await updateGoal(goal._id, { priority: nextPriority });
  };

  const saveInlineName = async (goal: Goal) => {
    if (editName.trim()) await updateGoal(goal._id, { name: editName.trim() });
    setEditingId(null);
  };

  const onDropReorder = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ix = goals.findIndex((g) => g._id === dragId);
    const jx = goals.findIndex((g) => g._id === targetId);
    if (ix < 0 || jx < 0) return;
    const next = [...goals];
    const [moved] = next.splice(ix, 1);
    next.splice(jx, 0, moved);
    setDragId(null);
    for (let i = 0; i < next.length; i++) {
      await updateGoal(next[i]._id, { sortOrder: Date.now() + i });
    }
    loadGoals();
  };

  if (loading) return <div className="p-8 text-slate-400">Loading goals...</div>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black text-white mb-2">Financial goals</h1>
        <p className="text-slate-400">
          {context === 'group' ? 'Shared goals for your group.' : 'Personal goals — drag cards to prioritize.'}
        </p>
      </div>

      <form
        onSubmit={handleAddGoal}
        className="bg-navy-800 rounded-3xl p-6 border border-slate-700/50 shadow-xl flex flex-wrap gap-4 items-end"
      >
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-slate-400 mb-1">Goal name</label>
          <input
            type="text"
            value={newGoal.name}
            onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
            className="w-full bg-navy-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary"
            placeholder="e.g. Dream vacation"
            required
          />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-medium text-slate-400 mb-1">Target amount (₹)</label>
          <input
            type="number"
            value={newGoal.targetAmount}
            onChange={(e) => setNewGoal({ ...newGoal, targetAmount: e.target.value })}
            className="w-full bg-navy-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary"
            placeholder="50000"
            required
          />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-medium text-slate-400 mb-1">Deadline (optional)</label>
          <input
            type="date"
            value={newGoal.deadline}
            onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })}
            className="w-full bg-navy-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary"
          />
        </div>
        <button
          type="submit"
          className="bg-primary hover:bg-emerald-400 text-navy-950 font-bold px-6 py-3 rounded-xl transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Create
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {goals.map((goal) => {
          const progress = Math.min(100, ((goal.currentAmount || 0) / goal.targetAmount) * 100);
          const priorityColor =
            goal.priority === 'High'
              ? 'text-danger bg-danger/10 border-danger/30'
              : goal.priority === 'Medium'
                ? 'text-warning bg-warning/10 border-warning/30'
                : 'text-primary bg-primary/10 border-primary/30';

          return (
            <div
              key={goal._id}
              draggable
              onDragStart={() => setDragId(goal._id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropReorder(goal._id)}
              className="bg-navy-800 rounded-3xl p-6 border border-slate-700/50 shadow-lg relative group overflow-hidden"
            >
              <div className="absolute top-4 left-4 text-slate-600 cursor-grab active:cursor-grabbing">
                <GripVertical className="w-4 h-4" />
              </div>
              <button
                onClick={() => deleteGoal(goal._id)}
                className="absolute top-4 right-4 text-slate-500 hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="flex items-start justify-between mb-4 pl-6">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${priorityColor}`}>
                    <Target className="w-4 h-4" />
                  </div>
                  {editingId === goal._id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => saveInlineName(goal)}
                      onKeyDown={(e) => e.key === 'Enter' && saveInlineName(goal)}
                      className="font-bold text-lg text-slate-100 bg-navy-900 border border-slate-600 rounded-lg px-2 py-0.5"
                    />
                  ) : (
                    <h3
                      className="font-bold text-lg text-slate-100 cursor-text"
                      onDoubleClick={() => {
                        setEditingId(goal._id);
                        setEditName(goal.name);
                      }}
                    >
                      {goal.name}
                    </h3>
                  )}
                </div>
              </div>

              <div className="flex items-end justify-between mb-2">
                <div>
                  <p className="text-2xl font-black text-white">₹{(goal.currentAmount || 0).toLocaleString()}</p>
                  <p className="text-xs text-slate-400">of ₹{goal.targetAmount.toLocaleString()}</p>
                </div>
                <button
                  type="button"
                  onClick={() => togglePriority(goal)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-md cursor-pointer border transition-colors ${priorityColor}`}
                >
                  {goal.priority.toUpperCase()} PRIORITY
                </button>
              </div>

              <div className="w-full bg-navy-900 rounded-full h-2 mb-4 overflow-hidden border border-slate-700/50">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {addingFundsTo === goal._id ? (
                <div className="flex gap-2 animate-in fade-in zoom-in duration-200">
                  <input
                    type="number"
                    autoFocus
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    placeholder="Amount..."
                    className="flex-1 bg-navy-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddFunds(goal)}
                    className="bg-primary text-navy-950 font-bold px-3 py-1.5 rounded-lg text-sm"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingFundsTo(null)}
                    className="text-slate-400 hover:text-white px-2"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingFundsTo(goal._id)}
                  className="w-full py-2 rounded-xl text-sm font-semibold text-primary hover:bg-primary/5 border border-primary/20 transition-colors flex items-center justify-center gap-2"
                >
                  <TrendingUp className="w-4 h-4" /> Add funds
                </button>
              )}
            </div>
          );
        })}
        {goals.length === 0 && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-700 rounded-3xl">
            <AlertCircle className="w-12 h-12 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No active goals found.</p>
          </div>
        )}
      </div>
    </div>
  );
};
