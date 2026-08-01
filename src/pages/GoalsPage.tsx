import React, { useState } from 'react';
import { useGoals, type Goal } from '../hooks/useGoals';
import { Target, TrendingUp, AlertCircle, Plus, Trash2, GripVertical, Calendar, Sparkles } from 'lucide-react';
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

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-bold text-stone-600 uppercase tracking-wider">Loading goals...</p>
      </div>
    );
  }

  const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  const totalSaved = goals.reduce((sum, g) => sum + (g.currentAmount || 0), 0);
  const overallProgress = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Banner & Stats Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-widest">
              CAPITAL ALLOCATION MATRIX
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[11px] font-semibold text-stone-500">
              {context === 'group' ? 'Squad Mode' : 'Personal Scope'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-display font-black tracking-tight text-stone-900">
            Milestones & Goals
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 mt-1 font-medium">
            Lock capital toward high-yield future ambitions.
          </p>
        </div>

        {goals.length > 0 && (
          <div className="flex items-center gap-4 p-4 rounded-3xl glass-card-frosted border border-white/80 shadow-xs">
            <div>
              <p className="text-[10px] uppercase font-bold text-stone-500">Aggregated Target</p>
              <p className="text-base font-bold text-stone-900">
                ₹{totalSaved.toLocaleString()} <span className="text-stone-400 font-normal">/ ₹{totalTarget.toLocaleString()}</span>
              </p>
            </div>
            <div className="px-3.5 py-1.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold shadow-xs">
              {overallProgress}% Locked
            </div>
          </div>
        )}
      </div>

      {/* Goal Creator Form */}
      <form
        onSubmit={handleAddGoal}
        className="glass-card-frosted rounded-3xl p-6 sm:p-7 border border-white/80 shadow-xs space-y-4"
      >
        <div className="flex items-center gap-2 pb-3 border-b border-stone-200/80">
          <Sparkles className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-bold text-stone-900">Deploy New Financial Milestone</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-bold text-stone-500 mb-1.5">
              Milestone Name
            </label>
            <input
              type="text"
              value={newGoal.name}
              onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
              className="w-full bg-white border border-stone-200 rounded-2xl px-4 py-3 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-xs"
              placeholder="e.g. M3 MacBook Pro or Tokyo Trip"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider font-bold text-stone-500 mb-1.5">
              Target Capital (₹)
            </label>
            <input
              type="number"
              value={newGoal.targetAmount}
              onChange={(e) => setNewGoal({ ...newGoal, targetAmount: e.target.value })}
              className="w-full bg-white border border-stone-200 rounded-2xl px-4 py-3 text-xs font-bold text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-xs"
              placeholder="e.g. 150000"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider font-bold text-stone-500 mb-1.5">
              Target Date (Optional)
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={newGoal.deadline}
                onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })}
                className="flex-1 bg-white border border-stone-200 rounded-2xl px-3 py-3 text-xs text-stone-900 focus:outline-none focus:border-amber-500 shadow-xs"
              />
              <button
                type="submit"
                className="dark-pill-btn px-5 py-3 text-xs font-bold shrink-0 flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Set Goal</span>
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Goals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {goals.map((goal) => {
          const progress = Math.min(100, Math.round(((goal.currentAmount || 0) / Math.max(1, goal.targetAmount)) * 100));
          const priorityStyles =
            goal.priority === 'High'
              ? 'text-rose-700 bg-rose-50 border-rose-200'
              : goal.priority === 'Medium'
                ? 'text-amber-800 bg-amber-50 border-amber-200'
                : 'text-stone-700 bg-stone-100 border-stone-200';

          return (
            <div
              key={goal._id}
              draggable
              onDragStart={() => setDragId(goal._id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropReorder(goal._id)}
              className="glass-card-frosted rounded-3xl p-6 border border-white/80 hover:border-amber-400/50 shadow-xs relative group flex flex-col justify-between transition-all"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="text-stone-400 cursor-grab active:cursor-grabbing p-1 hover:text-stone-700">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <div className="p-2 rounded-2xl bg-amber-100 text-amber-700 shadow-xs">
                      <Target className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => togglePriority(goal)}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${priorityStyles}`}
                    >
                      {goal.priority}
                    </button>
                    <button
                      onClick={() => deleteGoal(goal._id)}
                      className="text-stone-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {editingId === goal._id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => saveInlineName(goal)}
                    onKeyDown={(e) => e.key === 'Enter' && saveInlineName(goal)}
                    className="w-full font-bold text-base text-stone-900 bg-white border border-amber-500 rounded-xl px-3 py-1.5 mb-3 shadow-xs"
                  />
                ) : (
                  <h3
                    className="font-bold text-lg text-stone-900 mb-2 cursor-pointer hover:text-amber-700 transition-colors"
                    title="Double click to rename"
                    onDoubleClick={() => {
                      setEditingId(goal._id);
                      setEditName(goal.name);
                    }}
                  >
                    {goal.name}
                  </h3>
                )}

                <div className="flex items-baseline justify-between mb-3">
                  <div>
                    <span className="text-2xl font-black text-stone-900 font-display">
                      ₹{(goal.currentAmount || 0).toLocaleString()}
                    </span>
                    <span className="text-xs font-semibold text-stone-500 ml-1.5">
                      / ₹{goal.targetAmount.toLocaleString()}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-amber-700">{progress}%</span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-stone-100 rounded-full h-2 mb-4 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-orange-600 h-full rounded-full transition-all duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                {goal.deadline && (
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500 mb-4">
                    <Calendar className="w-3.5 h-3.5 text-stone-400" />
                    <span>Target: {new Date(goal.deadline).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {/* Fund Injection Area */}
              <div className="pt-3 border-t border-stone-200/80">
                {addingFundsTo === goal._id ? (
                  <div className="flex gap-2 animate-fadeIn">
                    <input
                      type="number"
                      autoFocus
                      value={fundAmount}
                      onChange={(e) => setFundAmount(e.target.value)}
                      placeholder="Add ₹..."
                      className="flex-1 bg-white border border-amber-500 rounded-xl px-3 py-1.5 text-xs text-stone-900 focus:outline-none shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddFunds(goal)}
                      className="dark-pill-btn px-4 py-1.5 text-xs font-bold"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingFundsTo(null)}
                      className="text-stone-400 hover:text-stone-700 px-2 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingFundsTo(goal._id)}
                    className="w-full py-2.5 rounded-full text-xs font-bold text-stone-700 hover:text-stone-950 bg-white/70 hover:bg-white border border-stone-200 transition-all flex items-center justify-center gap-2 shadow-xs"
                  >
                    <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                    <span>Inject Funds</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {goals.length === 0 && (
          <div className="col-span-full py-16 text-center border border-dashed border-stone-300 rounded-3xl glass-card-frosted">
            <AlertCircle className="w-10 h-10 text-stone-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-stone-800">No active goals deployed</p>
            <p className="text-xs text-stone-500 mt-1">Create your first goal above to start tracking.</p>
          </div>
        )}
      </div>
    </div>
  );
};


