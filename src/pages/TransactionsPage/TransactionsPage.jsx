import { useState, useEffect, useMemo } from 'react';
import CategorySelect from '../../components/shared/CategorySelect.jsx';
import RuleToast from '../../components/shared/RuleToast.jsx';
import { useRuleToast } from '../../hooks/useRuleToast.js';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import './TransactionsPage.css';

export default function TransactionsPage({
  statements,
  selectedId,
  allCategories,
  onCreateCategory,
  filters = {},
}) {
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const { pendingRule, triggerToast, saveRule, dismissToast } = useRuleToast();

  const {
    type: typeFilter = '',
    category: categoryFilter = '',
    minAmount = '',
    maxAmount = '',
    noRuleOnly = false,
    flaggedOnly = false,
    sortBy = 'date',
    sortDir = 'desc',
  } = filters;

  useEffect(() => {
    if (statements.length === 0) return;
    setLoading(true);
    const ids = selectedId ? [selectedId] : statements.map((s) => s.id);
    Promise.all(
      ids.map((id) =>
        fetch(`/api/statements/${id}`)
          .then((r) => r.json())
          // Attach _statementId so we know where to persist changes
          .then((d) => (d.transactions || []).map((t) => ({ ...t, _statementId: id })))
          .catch(() => [])
      )
    )
      .then((arrays) => setTxns(arrays.flat()))
      .finally(() => setLoading(false));
  }, [statements, selectedId]);

  const filtered = useMemo(() => {
    let list = txns;

    if (typeFilter === 'expense')    list = list.filter((t) => !t.isDeposit);
    else if (typeFilter === 'deposit')   list = list.filter((t) => t.isDeposit);
    else if (typeFilter === 'recurring') list = list.filter((t) => t.isRecurring);

    if (categoryFilter) list = list.filter((t) => !t.isDeposit && t.category === categoryFilter);
    if (minAmount !== '') list = list.filter((t) => Math.abs(t.amount) >= parseFloat(minAmount));
    if (maxAmount !== '') list = list.filter((t) => Math.abs(t.amount) <= parseFloat(maxAmount));
    if (noRuleOnly)   list = list.filter((t) => !t.ruleApplied && !t.isDeposit);
    if (flaggedOnly)  list = list.filter((t) => t.flagged);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.description?.toLowerCase().includes(q) ||
          t.activity?.toLowerCase().includes(q) ||
          t.category?.toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date')          cmp = (a.date || '').localeCompare(b.date || '');
      else if (sortBy === 'amount')   cmp = Math.abs(a.amount) - Math.abs(b.amount);
      else if (sortBy === 'category') cmp = (a.category || '').localeCompare(b.category || '');
      else if (sortBy === 'merchant') cmp = (a.description || '').localeCompare(b.description || '');
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [txns, filters, search]);

  const updateTxn = (txn, newCategory) => {
    setTxns((prev) => prev.map((t) => (t.id === txn.id ? { ...t, category: newCategory } : t)));
    triggerToast(txn.description, newCategory, txn.isRecurring);
    fetch(`/api/statements/${txn._statementId}/transactions/${txn.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: newCategory }),
    });
  };

  const toggleFlag = async (txn) => {
    const newFlagged = !txn.flagged;
    setTxns((prev) =>
      prev.map((t) => (t.id === txn.id ? { ...t, flagged: newFlagged } : t))
    );
    await fetch(`/api/statements/${txn._statementId}/transactions/${txn.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flagged: newFlagged }),
    });
  };

  const deleteTxn = async (txn) => {
    setTxns((prev) => prev.filter((t) => t.id !== txn.id));
    await fetch(`/api/statements/${txn._statementId}/transactions/${txn.id}`, {
      method: 'DELETE',
    });
  };

  const flaggedCount = txns.filter((t) => t.flagged).length;

  const transferAmount = filtered
    .filter((t) => !t.isDeposit && t.category === 'Transfers')
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalIn  = filtered.filter((t) => t.isDeposit).reduce((s, t) => s + t.amount, 0) - transferAmount;
  const totalOut = filtered.filter((t) => !t.isDeposit && t.category !== 'Transfers').reduce((s, t) => s + Math.abs(t.amount), 0);
  const net = totalIn - totalOut;

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
          {!loading && <span className="tx-count">{filtered.length} shown</span>}
          {!loading && flaggedCount > 0 && (
            <span className="tx-flag-count">🚩 {flaggedCount} flagged</span>
          )}
        </div>
        {!loading && (
          <div className="tx-totals">
            <div className="tx-totals-item">
              <span className="tx-totals-label">In</span>
              <span className={`tx-totals-value ${totalIn >= 0 ? 'pos' : 'neg'}`}>
                {totalIn >= 0 ? '+' : '−'}{formatCurrency(Math.abs(totalIn))}
              </span>
            </div>
            <div className="tx-totals-sep" />
            <div className="tx-totals-item">
              <span className="tx-totals-label">Out</span>
              <span className="tx-totals-value neg">−{formatCurrency(totalOut)}</span>
            </div>
            <div className="tx-totals-sep" />
            <div className="tx-totals-item">
              <span className="tx-totals-label">Net</span>
              <span className={`tx-totals-value ${net >= 0 ? 'pos' : 'neg'}`}>
                {net >= 0 ? '+' : '−'}{formatCurrency(Math.abs(net))}
              </span>
            </div>
          </div>
        )}
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
                <th className="tx-col-flag"></th>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th className="tx-col-right">Amount</th>
                <th className="tx-col-del"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  className={[
                    t.isDeposit ? 'tx-row-deposit' : '',
                    t.flagged ? 'tx-row-flagged' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <td className="tx-col-flag">
                    <button
                      className={`tx-flag-btn${t.flagged ? ' active' : ''}`}
                      onClick={() => toggleFlag(t)}
                      title={t.flagged ? 'Remove flag' : 'Flag for review'}
                      aria-label={t.flagged ? 'Remove flag' : 'Flag for review'}
                    >
                      🚩
                    </button>
                  </td>
                  <td className="tx-date">{formatDate(t.date)}</td>
                  <td className="tx-desc">
                    <span className="tx-source">{t.description}</span>
                    {t.activity && <span className="tx-activity">{t.activity}</span>}
                  </td>
                  <td className="tx-cat">
                    {t.isDeposit ? (
                      <span className="tx-deposit-tag">Deposit</span>
                    ) : (
                      <CategorySelect
                        value={t.category}
                        categories={allCategories}
                        onChange={(cat) => updateTxn(t, cat)}
                        onCreateCategory={onCreateCategory}
                      />
                    )}
                  </td>
                  <td className={`tx-amount tx-col-right ${t.isDeposit ? 'pos' : 'neg'}`}>
                    {t.isDeposit ? '+' : '-'}{formatCurrency(Math.abs(t.amount))}
                  </td>
                  <td className="tx-col-del">
                    <button
                      className="tx-del-btn"
                      onClick={() => deleteTxn(t)}
                      title="Delete transaction"
                      aria-label="Delete transaction"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="tx-none">No transactions match</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <RuleToast pendingRule={pendingRule} onSave={saveRule} onDismiss={dismissToast} />
    </div>
  );
}
