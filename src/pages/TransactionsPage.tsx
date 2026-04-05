import React, { useEffect, useState } from 'react';
import { Receipt, Trash2 } from 'lucide-react';
import { getTransactions, fetchFingetApi } from '../api';
import { useScope } from '../context/ScopeContext';

type Tx = {
  _id: string;
  amount: number;
  category: string;
  type: string;
  date: string;
};

export const TransactionsPage: React.FC = () => {
  const { context, groupId } = useScope();
  const [items, setItems] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="animate-in fade-in max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white mb-2">Transaction history</h1>
        <p className="text-slate-400">
          {context === 'group' ? 'Shared group transactions.' : 'Your personal ledger.'}
        </p>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <div
              key={t._id}
              className="flex items-center justify-between bg-navy-800 rounded-2xl px-4 py-3 border border-slate-700/50"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-navy-900 text-primary">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-medium text-slate-100">{t.category}</p>
                  <p className="text-xs text-slate-500">
                    {t.type} · {new Date(t.date).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`font-bold ${t.type === 'expense' ? 'text-danger' : 'text-primary'}`}
                >
                  {t.type === 'expense' ? '-' : '+'}₹{t.amount.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => remove(t._id)}
                  className="p-2 text-slate-500 hover:text-danger rounded-lg"
                  aria-label="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-slate-500 text-center py-12 border border-dashed border-slate-700 rounded-2xl">
              No transactions yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
