import { useState, useEffect, useMemo } from 'react';
import CategorySelect from '../../components/shared/CategorySelect.jsx';
import RuleToast from '../../components/shared/RuleToast.jsx';
import { useRuleToast } from '../../hooks/useRuleToast.js';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import './TransactionsPage.css';

const TYPE_OPTIONS = [
  { key: '', label: 'All' },
  { key: 'expense', label: 'Expenses' },
  { key: 'deposit', label: 'Deposits' },
  { key: 'recurring', label: 'Recurring' },
];

const SORT_OPTIONS = [
  { key: 'date', label: 'Date' },
  { key: 'amount', label: 'Amount' },
  { key: 'category', label: 'Category' },
  { key: 'merchant', label: 'Merchant' },
];

export default function TransactionsPage({
  statements,
  selectedId,
  allCategories,
  onCreateCategory,
}) {
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [noRuleOnly, setNoRuleOnly] = useState(false);

  // Sort
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const { pendingRule, triggerToast, saveRule, dismissToast } = useRuleToast();

  useEffect(() => {
    if (statements.length === 0) return;
    setLoading(true);
    const ids = selectedId ? [selectedId] : statements.map((s) => s.id);
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

    if (typeFilter === 'expense') list = list.filter((t) => !t.isDeposit);
    else if (typeFilter === 'deposit') list = list.filter((t) => t.isDeposit);
    else if (typeFilter === 'recurring') list = list.filter((t) => t.isRecurring);

    if (categoryFilter) list = list.filter((t) => t.category === categoryFilter);

    if (minAmount !== '') list = list.filter((t) => Math.abs(t.amount) >= parseFloat(minAmount));
    if (maxAmount !== '') list = list.filter((t) => Math.abs(t.amount) <= parseFloat(maxAmount));

    if (noRuleOnly) list = list.filter((t) => !t.ruleApplied && !t.isDeposit);

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
      if (sortBy === 'date')     cmp = (a.date || '').localeCompare(b.date || '');
      else if (sortBy === 'amount')   cmp = Math.abs(a.amount) - Math.abs(b.amount);
      else if (sortBy === 'category') cmp = (a.category || '').localeCompare(b.category || '');
      else if (sortBy === 'merchant') cmp = (a.description || '').localeCompare(b.description || '');
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [txns, typeFilter, categoryFilter, minAmount, maxAmount, noRuleOnly, sortBy, sortDir, search]);

  const updateTxn = (txn, newCategory) => {
    setTxns((prev) => prev.map((t) => (t.id === txn.id ? { ...t, category: newCategory } : t)));
    triggerToast(txn.description, newCategory);
  };

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
      {/* Header row */}
      <div className="tx-header">
        <div className="tx-header-left">
          <h1>Transactions</h1>
          {!loading && <span className="tx-count">{filtered.length} shown</span>}
        </div>
        <input
          className="tx-search"
          type="text"
          placeholder="Search transactions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filter bar */}
      <div className="tx-filters">
        {/* Type pills */}
        <div className="tx-type-pills">
          {TYPE_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              className={`tx-type-pill${typeFilter === key ? ' active' : ''}`}
              onClick={() => setTypeFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="tx-filter-sep" />

        {/* Category */}
        <select
          className="tx-filter-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Amount range */}
        <div className="tx-amount-range">
          <input
            className="tx-amount-input"
            type="number"
            placeholder="$ min"
            min="0"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
          />
          <span className="tx-amount-sep">–</span>
          <input
            className="tx-amount-input"
            type="number"
            placeholder="$ max"
            min="0"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
          />
        </div>

        <div className="tx-filter-sep" />

        {/* Sort */}
        <div className="tx-sort-group">
          <select
            className="tx-filter-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <button
            className="tx-sort-dir"
            onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
            title={sortDir === 'desc' ? 'Descending' : 'Ascending'}
          >
            {sortDir === 'desc' ? '↓' : '↑'}
          </button>
        </div>

        <div className="tx-filter-sep" />

        {/* Unmatched only */}
        <label className={`tx-norule${noRuleOnly ? ' active' : ''}`}>
          <input
            type="checkbox"
            checked={noRuleOnly}
            onChange={(e) => setNoRuleOnly(e.target.checked)}
          />
          Unmatched only
        </label>
      </div>

      {/* Table */}
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

      <RuleToast pendingRule={pendingRule} onSave={saveRule} onDismiss={dismissToast} />
    </div>
  );
}
