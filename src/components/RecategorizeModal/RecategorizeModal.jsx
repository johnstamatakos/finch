import { useState, useMemo } from 'react';
import CategorySelect from '../shared/CategorySelect.jsx';
import { formatCurrency, formatDate, ymToLabel } from '../../utils/formatters.js';
import './RecategorizeModal.css';

/**
 * Modal shown when deleting a custom category.
 * Lets the user pick a new category for each affected transaction
 * (or bulk-move all at once) before confirming deletion.
 *
 * Props:
 *   category       – name of category being deleted
 *   transactions   – [{ id, _statementId, date, description, amount }]
 *   allCategories  – string[] for the category select
 *   onConfirm(updates) – called with [{ stmtId, txId, category }]
 *   onClose        – called on cancel or backdrop click
 */
export default function RecategorizeModal({ category, transactions, allCategories, onConfirm, onClose }) {
  const availableCategories = allCategories.filter((c) => c !== category);
  const defaultTarget = availableCategories.includes('Other') ? 'Other' : (availableCategories[0] || '');

  // Map of txId → new category
  const [assignments, setAssignments] = useState(() =>
    Object.fromEntries(transactions.map((t) => [t.id, defaultTarget]))
  );
  const [saving, setSaving] = useState(false);

  const setAll = (cat) =>
    setAssignments(Object.fromEntries(transactions.map((t) => [t.id, cat])));

  const setOne = (txId, cat) =>
    setAssignments((prev) => ({ ...prev, [txId]: cat }));

  // Group transactions by month for display
  const groups = useMemo(() => {
    const map = new Map();
    for (const tx of transactions) {
      const ym = tx.date?.slice(0, 7) || 'unknown';
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym).push(tx);
    }
    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a)) // newest first
      .map(([ym, txs]) => ({ ym, label: ymToLabel(ym), txs }));
  }, [transactions]);

  const handleConfirm = async () => {
    setSaving(true);
    const updates = transactions.map((t) => ({
      stmtId: t._statementId,
      txId: t.id,
      category: assignments[t.id] || defaultTarget,
    }));
    await onConfirm(updates);
    setSaving(false);
  };

  // All assignments must be non-empty to confirm
  const canConfirm = transactions.every((t) => assignments[t.id]);

  return (
    <div className="rcm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rcm-modal" role="dialog" aria-modal="true">
        <div className="rcm-header">
          <div>
            <h2 className="rcm-title">Delete &ldquo;{category}&rdquo;</h2>
            <p className="rcm-subtitle">
              {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} will be reassigned
            </p>
          </div>
          <button className="rcm-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {transactions.length > 0 && (
          <div className="rcm-bulk-bar">
            <span className="rcm-bulk-label">Move all to</span>
            <CategorySelect
              value={defaultTarget}
              categories={availableCategories}
              onChange={setAll}
            />
          </div>
        )}

        <div className="rcm-body">
          {transactions.length === 0 ? (
            <p className="rcm-empty">No transactions in this category.</p>
          ) : (
            groups.map(({ ym, label, txs }) => (
              <div key={ym} className="rcm-group">
                <div className="rcm-group-label">{label}</div>
                <table className="rcm-table">
                  <tbody>
                    {txs.map((tx) => (
                      <tr key={tx.id} className="rcm-row">
                        <td className="rcm-col-date">{formatDate(tx.date)}</td>
                        <td className="rcm-col-desc">{tx.description}</td>
                        <td className="rcm-col-amount">{formatCurrency(tx.amount)}</td>
                        <td className="rcm-col-cat">
                          <CategorySelect
                            value={assignments[tx.id] || defaultTarget}
                            categories={availableCategories}
                            onChange={(cat) => setOne(tx.id, cat)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>

        <div className="rcm-footer">
          <button className="rcm-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="rcm-btn-confirm"
            onClick={handleConfirm}
            disabled={!canConfirm || saving}
          >
            {saving ? 'Saving…' : `Reassign & Delete`}
          </button>
        </div>
      </div>
    </div>
  );
}

