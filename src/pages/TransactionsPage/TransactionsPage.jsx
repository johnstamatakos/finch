import { useState, useEffect, useMemo, useRef } from 'react';
import CategorySelect from '../../components/shared/CategorySelect.jsx';
import RuleToast from '../../components/shared/RuleToast.jsx';
import { useRuleToast } from '../../hooks/useRuleToast.js';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import './TransactionsPage.css';

const PAGE_SIZE = 100;

export default function TransactionsPage({
  statements,
  selectedId,
  allCategories,
  onCreateCategory,
  onStatementChange,
  filters = {},
}) {
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { pendingRule, triggerToast, saveRule, dismissToast } = useRuleToast();

  // Bulk-select state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkCategory, setBulkCategory] = useState('');
  const selectAllRef = useRef(null);

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
    }).then(() => onStatementChange?.());
  };

  const toggleRecurring = async (txn) => {
    const newVal = !txn.isRecurring;
    setTxns((prev) => prev.map((t) => (t.id === txn.id ? { ...t, isRecurring: newVal } : t)));
    await fetch(`/api/statements/${txn._statementId}/transactions/${txn.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRecurring: newVal }),
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
    onStatementChange?.();
  };

  // Reset to page 1 and clear selection whenever filters/search change
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart  = (page - 1) * PAGE_SIZE;
  const paginated  = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  // Selectable = expense rows only (deposits can't be recategorized)
  const selectableIds = paginated.filter((t) => !t.isDeposit).map((t) => t.id);
  const selectedOnPage = selectableIds.filter((id) => selectedIds.has(id));
  const allPageSelected = selectableIds.length > 0 && selectedOnPage.length === selectableIds.length;
  const somePageSelected = selectedOnPage.length > 0 && !allPageSelected;

  // Drive indeterminate state on the select-all checkbox
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePageSelected;
    }
  }, [somePageSelected]);

  const toggleAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkRecategorize = async () => {
    if (!bulkCategory || selectedIds.size === 0) return;
    const updates = [...selectedIds].flatMap((id) => {
      const tx = filtered.find((t) => t.id === id);
      if (!tx) return [];
      return [{ stmtId: tx._statementId, txId: tx.id, category: bulkCategory }];
    });
    if (updates.length === 0) return;
    await fetch('/api/statements/bulk-recategorize', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    // Optimistic local update
    setTxns((prev) =>
      prev.map((t) => (selectedIds.has(t.id) ? { ...t, category: bulkCategory } : t))
    );
    setSelectedIds(new Set());
    setBulkCategory('');
    onStatementChange?.();
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
          {!loading && (
            <span className="tx-count">
              {filtered.length === 0
                ? '0 transactions'
                : filtered.length <= PAGE_SIZE
                ? `${filtered.length} transactions`
                : `${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filtered.length)} of ${filtered.length}`}
            </span>
          )}
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
        <>
          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th className="tx-col-check">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      className="tx-checkbox"
                      checked={allPageSelected}
                      onChange={toggleAll}
                      aria-label="Select all on page"
                      disabled={selectableIds.length === 0}
                    />
                  </th>
                  <th className="tx-col-flag"></th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th className="tx-col-rec">Recurring</th>
                  <th className="tx-col-right">Amount</th>
                  <th className="tx-col-del"></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((t) => (
                  <tr
                    key={t.id}
                    className={[
                      t.isDeposit ? 'tx-row-deposit' : '',
                      t.flagged ? 'tx-row-flagged' : '',
                      selectedIds.has(t.id) ? 'tx-row-selected' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <td className="tx-col-check">
                      {!t.isDeposit && (
                        <input
                          type="checkbox"
                          className="tx-checkbox"
                          checked={selectedIds.has(t.id)}
                          onChange={() => toggleOne(t.id)}
                          aria-label="Select transaction"
                        />
                      )}
                    </td>
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
                    <td className="tx-col-rec">
                      {!t.isDeposit && (
                        <button
                          className={`tx-rec-btn${t.isRecurring ? ' active' : ''}`}
                          onClick={() => toggleRecurring(t)}
                          title={t.isRecurring ? 'Mark as one-time' : 'Mark as recurring'}
                          aria-label={t.isRecurring ? 'Mark as one-time' : 'Mark as recurring'}
                        >
                          ↻
                        </button>
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
                    <td colSpan={8} className="tx-none">No transactions match</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {selectedIds.size > 0 && (
            <div className="tx-bulk-bar">
              <span className="tx-bulk-count">{selectedIds.size} selected</span>
              <button
                className="tx-bulk-clear"
                onClick={() => setSelectedIds(new Set())}
                aria-label="Clear selection"
              >
                ✕
              </button>
              <span className="tx-bulk-sep" />
              <span className="tx-bulk-label">Move to</span>
              <CategorySelect
                value={bulkCategory}
                categories={allCategories}
                onChange={setBulkCategory}
                placeholder="Choose category…"
              />
              <button
                className="tx-bulk-apply"
                onClick={handleBulkRecategorize}
                disabled={!bulkCategory}
              >
                Apply
              </button>
            </div>
          )}
        </>
      )}

      {!loading && totalPages > 1 && (
        <div className="tx-pagination">
          <button
            className="tx-page-btn"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Prev
          </button>
          <span className="tx-page-info">Page {page} of {totalPages}</span>
          <button
            className="tx-page-btn"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}

      <RuleToast pendingRule={pendingRule} onSave={saveRule} onDismiss={dismissToast} />
    </div>
  );
}
