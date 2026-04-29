import { useState, useEffect, useRef, useMemo } from 'react';
import { LineChart, Line, Tooltip, ResponsiveContainer } from 'recharts';
import RecategorizeModal from '../../components/RecategorizeModal/RecategorizeModal.jsx';
import { CATEGORIES, CATEGORY_COLORS } from '../../constants/categories.js';
import { formatCurrency } from '../../utils/formatters.js';
import { TOOLTIP_STYLE } from '../../constants/chartTheme.js';
import './CategoriesPage.css';

const BUILTIN = new Set(CATEGORIES);

export default function CategoriesPage({
  allCategories,
  onAddCategory,
  onRenameCategory,
  onRemoveCategory,
  onStatementChange,
}) {
  const [allTransactions, setAllTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add-category form
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState(null); // { category, transactions }

  // Load all statement transactions on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/statements')
      .then((r) => r.json())
      .then(async (metas) => {
        if (!Array.isArray(metas)) return;
        const results = await Promise.all(
          metas.map((m) =>
            fetch(`/api/statements/${m.id}`)
              .then((r) => r.json())
              .then((stmt) =>
                (stmt.transactions || []).map((t) => ({ ...t, _statementId: m.id }))
              )
              .catch(() => [])
          )
        );
        if (!cancelled) {
          setAllTransactions(results.flat());
          setLoading(false);
        }
      })
      .catch(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  // Aggregate stats per category from all non-deposit transactions
  const stats = useMemo(() => {
    const map = {};
    for (const tx of allTransactions) {
      if (tx.isDeposit) continue;
      const cat = tx.category || 'Other';
      if (!map[cat]) map[cat] = { totalSpent: 0, txCount: 0, monthlySpend: {}, merchantCounts: {} };
      const s = map[cat];
      const amt = Math.abs(tx.amount);
      s.totalSpent += amt;
      s.txCount++;
      const ym = tx.date?.slice(0, 7) || 'unknown';
      s.monthlySpend[ym] = (s.monthlySpend[ym] || 0) + amt;
      const desc = tx.description || '';
      s.merchantCounts[desc] = (s.merchantCounts[desc] || 0) + 1;
    }
    return map;
  }, [allTransactions]);

  // Last 12 calendar months for sparklines
  const last12Months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAddError('');
    const result = await onAddCategory(trimmed);
    if (result === null) {
      setAddError('Category already exists.');
    } else {
      setNewName('');
    }
  };

  const handleDeleteClick = (category) => {
    const txs = allTransactions.filter((t) => !t.isDeposit && t.category === category);
    setDeleteModal({ category, transactions: txs });
  };

  const handleDeleteConfirm = async (updates) => {
    // 1. Bulk-recategorize affected transactions
    if (updates.length > 0) {
      await fetch('/api/statements/bulk-recategorize', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
    }
    // 2. Delete the category
    await onRemoveCategory(deleteModal.category);
    setDeleteModal(null);
    // 3. Refresh transaction data
    onStatementChange();
    // Reload local transaction cache
    const metas = await fetch('/api/statements').then((r) => r.json()).catch(() => []);
    if (Array.isArray(metas)) {
      const results = await Promise.all(
        metas.map((m) =>
          fetch(`/api/statements/${m.id}`)
            .then((r) => r.json())
            .then((stmt) => (stmt.transactions || []).map((t) => ({ ...t, _statementId: m.id })))
            .catch(() => [])
        )
      );
      setAllTransactions(results.flat());
    }
  };

  return (
    <div className="cat-page">
      <div className="cat-header">
        <h1 className="cat-title">Categories</h1>
        <form className="cat-add-form" onSubmit={handleAdd}>
          <input
            className={`cat-add-input${addError ? ' cat-add-input-error' : ''}`}
            type="text"
            placeholder="New category name…"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setAddError(''); }}
          />
          <button className="cat-add-btn" type="submit" disabled={!newName.trim()}>
            + Add
          </button>
          {addError && <span className="cat-add-err">{addError}</span>}
        </form>
      </div>

      {loading ? (
        <div className="cat-loading">Loading…</div>
      ) : (
        <div className="cat-list">
          {allCategories.map((cat) => (
            <CategoryRow
              key={cat}
              category={cat}
              isCustom={!BUILTIN.has(cat)}
              stats={stats[cat] || null}
              last12Months={last12Months}
              allCategories={allCategories}
              onRename={onRenameCategory}
              onDelete={() => handleDeleteClick(cat)}
            />
          ))}
        </div>
      )}

      {deleteModal && (
        <RecategorizeModal
          category={deleteModal.category}
          transactions={deleteModal.transactions}
          allCategories={allCategories}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeleteModal(null)}
        />
      )}
    </div>
  );
}

// ── CategoryRow ───────────────────────────────────────────────────────────────

function CategoryRow({ category, isCustom, stats, last12Months, allCategories, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(category);
  const [renameError, setRenameError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const sparkData = last12Months.map((ym) => ({
    ym,
    amount: stats?.monthlySpend[ym] || 0,
  }));

  const hasData = sparkData.some((d) => d.amount > 0);

  const topMerchants = stats
    ? Object.entries(stats.merchantCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
    : [];

  const color = CATEGORY_COLORS[category] || '#64748b';

  const startEditing = () => {
    setEditValue(category);
    setRenameError('');
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setRenameError('');
  };

  const commitRename = async () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === category) { cancelEditing(); return; }
    const result = await onRename(category, trimmed);
    if (result === null) {
      setRenameError('Name already taken.');
    } else {
      setEditing(false);
      setRenameError('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') cancelEditing();
  };

  return (
    <div className="cat-row">
      <div className="cat-row-info">
        <div className="cat-name-row">
          <span className="cat-dot" style={{ background: color }} />
          {editing ? (
            <span className="cat-rename-wrap">
              <input
                ref={inputRef}
                className="cat-rename-input"
                value={editValue}
                onChange={(e) => { setEditValue(e.target.value); setRenameError(''); }}
                onBlur={commitRename}
                onKeyDown={handleKeyDown}
              />
              {renameError && <span className="cat-rename-err">{renameError}</span>}
            </span>
          ) : (
            <span className="cat-name">{category}</span>
          )}
          {isCustom && !editing && (
            <span className="cat-actions">
              <button className="cat-icon-btn" title="Rename" onClick={startEditing}>✎</button>
              <button className="cat-icon-btn cat-icon-delete" title="Delete" onClick={onDelete}>✕</button>
            </span>
          )}
        </div>

        <div className="cat-meta">
          {stats ? (
            <>
              <span className="cat-total">{formatCurrency(stats.totalSpent)}</span>
              <span className="cat-sep">·</span>
              <span className="cat-count">{stats.txCount} transaction{stats.txCount !== 1 ? 's' : ''}</span>
            </>
          ) : (
            <span className="cat-no-data">No spending data</span>
          )}
        </div>

        {topMerchants.length > 0 && (
          <div className="cat-merchants">
            {topMerchants.map(([desc, count]) => (
              <span key={desc} className="cat-merchant-chip">
                {desc} <span className="cat-merchant-count">×{count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="cat-sparkline">
        {hasData ? (
          <ResponsiveContainer width="100%" height={48}>
            <LineChart data={sparkData}>
              <Line
                type="monotone"
                dataKey="amount"
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: color }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                itemStyle={{ color: '#f1f5f9' }}
                formatter={(val) => [formatCurrency(val), '']}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.ym || ''}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <span className="cat-spark-empty">—</span>
        )}
      </div>
    </div>
  );
}
