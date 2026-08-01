import React, { useEffect, useState } from 'react';
import { Receipt, Trash2, ArrowDownRight, ArrowUpRight, Search, RefreshCw } from 'lucide-react';
import { getTransactions, fetchFingetApi } from '../api';
import { useScope } from '../context/ScopeContext';

type Tx = {
  _id: string;
  amount: number;
  category: string;
  type: string;
  description?: string;
  date: string;
};

export const TransactionsPage: React.FC = () => {
  const { context, groupId } = useScope();
  const [items, setItems] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');

  const load = () => {
    setLoading(true);
    getTransactions(context, groupId)
      .then((data) => setItems(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [context, groupId]);

  const remove = async (id: string) => {
    await fetchFingetApi(`/transactions/${id}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((t) => t._id !== id));
  };

  const filteredItems = items.filter((t) => {
    const matchSearch =
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(search.toLowerCase()));
    const matchType = filterType === 'all' || t.type === filterType;
    return matchSearch && matchType;
  });

  const totalInflow = items.filter((t) => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
  const totalOutflow = items.filter((t) => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-widest">
              IMMUTABLE AUDIT LOG
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[11px] font-semibold text-stone-500">
              {context === 'group' ? 'Squad Shared' : 'Personal Vault'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-display font-black tracking-tight text-stone-900">
            Ledger & Transaction History
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 mt-1 font-medium">
            Structured income & expense stream with real-time balance calculations.
          </p>
        </div>

        <button
          onClick={load}
          className="p-2.5 rounded-2xl glass-card-frosted border border-white/80 text-stone-600 hover:text-stone-900 shadow-xs transition-colors self-start md:self-auto"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-600' : ''}`} />
        </button>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card-frosted rounded-3xl p-5 border border-white/80 shadow-xs">
          <p className="text-[10px] uppercase font-bold tracking-widest text-stone-500">TOTAL CAPITAL INFLOW</p>
          <p className="text-2xl font-black font-display text-emerald-700 mt-1">
            +₹{totalInflow.toLocaleString()}
          </p>
        </div>

        <div className="glass-card-frosted rounded-3xl p-5 border border-white/80 shadow-xs">
          <p className="text-[10px] uppercase font-bold tracking-widest text-stone-500">TOTAL CAPITAL OUTFLOW</p>
          <p className="text-2xl font-black font-display text-rose-700 mt-1">
            -₹{totalOutflow.toLocaleString()}
          </p>
        </div>

        <div className="glass-card-frosted rounded-3xl p-5 border border-white/80 shadow-xs">
          <p className="text-[10px] uppercase font-bold tracking-widest text-stone-500">RECORDED TRANSACTIONS</p>
          <p className="text-2xl font-black font-display text-stone-900 mt-1">
            {items.length} Entries
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-card-frosted rounded-3xl p-4 border border-white/80 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search category or merchant..."
            className="w-full bg-white border border-stone-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-500 shadow-xs"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-2xl bg-stone-100 border border-stone-200 w-full sm:w-auto">
          {(['all', 'expense', 'income'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-4 py-1.5 rounded-xl text-[11px] font-bold uppercase transition-all flex-1 sm:flex-initial ${
                filterType === t
                  ? 'bg-white text-stone-900 shadow-xs font-bold'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions List */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs font-bold text-stone-600 uppercase tracking-wider">Syncing ledger records...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((t) => {
            const isExp = t.type === 'expense';

            return (
              <div
                key={t._id}
                className="glass-card-frosted rounded-2xl p-4 sm:p-5 border border-white/80 hover:border-amber-300 transition-all flex items-center justify-between gap-4 group shadow-xs"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`p-2.5 rounded-2xl shrink-0 ${
                      isExp
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {isExp ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-stone-900 truncate">
                        {t.description || t.category}
                      </h4>
                      <span className="text-[10px] uppercase px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700 font-bold border border-stone-200">
                        {t.category}
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-stone-500 mt-0.5">
                      {new Date(t.date).toLocaleDateString()} · {new Date(t.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <span
                    className={`font-display text-base font-bold ${
                      isExp ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {isExp ? '-' : '+'}₹{t.amount.toLocaleString()}
                  </span>

                  <button
                    type="button"
                    onClick={() => remove(t._id)}
                    className="p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors opacity-0 group-hover:opacity-100"
                    aria-label="Delete entry"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="py-16 text-center rounded-3xl glass-card-frosted border border-dashed border-stone-300">
              <Receipt className="w-10 h-10 text-stone-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-stone-800">No matching transactions</p>
              <p className="text-xs text-stone-500 mt-1 font-medium">Record a transaction on the Dashboard to view here.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};


