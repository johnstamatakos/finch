import { useState, useEffect, useMemo } from 'react';
import CategorySelect from '../../components/shared/CategorySelect.jsx';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import { CATEGORY_COLORS } from '../../constants/categories.js';
import './TransactionsPage.css';

export default function TransactionsPage({
  statements,
  selectedId,
  allCategories,
  onCreateCategory,
  filters,
}) {
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Load transactions for selected statement or all
  useEffect(() => {
    if (statements.length === 0) return;
    setLoading(true);

    const ids = selectedId
      ? [selectedId]
      : statements.map((s) => s.id);

    Promise.all(
      ids.map((id) =>
        fetch(`/api/statements/${id}`)
          .then((r) => r.json())
          .then((d) => d.transactions || [])
          .catch(() => [])
      )
    )
      .then((arrays) => setTxns(arrays.flat()))
      .finally(() => setLoading(false));
  }, [statements, selectedId]);

  const filtered = useMemo(() => {
    let list = txns;

    if (filters?.category) {
      list = list.filter((t) => t.category === filters.category);
    }
    if (filters?.type === 'expense') {
      list = list.filter((t) => !t.isDeposit);
    } else if (filters?.type === 'deposit') {
      list = list.filter((t) => t.isDeposit);
    } else if (filters?.type === 'recurring') {
      list = list.filter((t) => t.isRecurring);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.description?.toLowerCase().includes(q) ||
          t.activity?.toLowerCase().includes(q) ||
          t.category?.toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [txns, filters, search]);

  const updateTxn = (id, updates) =>
    setTxns((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));

  if (statements.length === 0) {
    return (
      <div className="tx-page">
        <div className="tx-empty">
          <div className="tx-empty-icon">💳</div>
          <h2>No transactions yet</h2>
          <p>Upload a statement to see your transactions here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tx-page">
      <div className="tx-header">
        <div className="tx-header-left">
          <h1>Transactions</h1>
          {!loading && (
            <span className="tx-count">{filtered.length} shown</span>
          )}
        </div>
        <input
          className="tx-search"
          type="text"
          placeholder="Search transactions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="tx-loading">Loading…</div>
      ) : (
        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th className="tx-col-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className={t.isDeposit ? 'tx-row-deposit' : ''}>
                  <td className="tx-date">{formatDate(t.date)}</td>
                  <td className="tx-desc">
                    <span className="tx-source">{t.description}</span>
                    {t.activity && (
                      <span className="tx-activity">{t.activity}</span>
                    )}
                  </td>
                  <td className="tx-cat">
                    {t.isDeposit ? (
                      <span className="tx-deposit-tag">Deposit</span>
                    ) : (
                      <CategorySelect
                        value={t.category}
                        categories={allCategories}
                        onChange={(cat) => updateTxn(t.id, { category: cat })}
                        onCreateCategory={onCreateCategory}
                      />
                    )}
                  </td>
                  <td className={`tx-amount tx-col-right ${t.isDeposit ? 'pos' : 'neg'}`}>
                    {t.isDeposit ? '+' : '-'}{formatCurrency(Math.abs(t.amount))}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="tx-none">No transactions match</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
