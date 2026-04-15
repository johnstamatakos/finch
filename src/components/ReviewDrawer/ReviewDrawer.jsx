import { useState, useMemo } from 'react';
import CategorySelect from '../shared/CategorySelect.jsx';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import './ReviewDrawer.css';

export default function ReviewDrawer({
  initialTransactions,
  defaultName,
  allCategories,
  onCreateCategory,
  onSave,
  onClose,
}) {
  const [txns, setTxns] = useState(initialTransactions);
  const [name, setName] = useState(defaultName || '');
  const [goodExpanded, setGoodExpanded] = useState(false);

  const update = (id, updates) =>
    setTxns((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));

  const { lookingGood, reviewThese } = useMemo(() => ({
    lookingGood: txns.filter((t) => t.ruleApplied || t.isDeposit),
    reviewThese: txns.filter((t) => !t.ruleApplied && !t.isDeposit),
  }), [txns]);

  const handleSave = () => {
    const saveName = name.trim() || defaultName || 'Untitled Statement';
    onSave(saveName, txns);
  };

  const totalExpenses = txns
    .filter((t) => !t.isDeposit)
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div className="drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer-panel">
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-title-group">
            <h2>Review Transactions</h2>
            <span className="drawer-count">{txns.length} total · {formatCurrency(totalExpenses)} expenses</span>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Statement name */}
        <div className="drawer-name-row">
          <input
            className="drawer-name-input"
            type="text"
            placeholder="Statement name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </div>

        {/* Scrollable transaction groups */}
        <div className="drawer-body">
          {/* Needs Review */}
          {reviewThese.length > 0 && (
            <section className="drawer-group">
              <div className="drawer-group-header review">
                <span className="drawer-group-icon">⚠</span>
                <span className="drawer-group-title">Review These</span>
                <span className="drawer-group-badge">{reviewThese.length}</span>
              </div>
              <div className="drawer-group-rows">
                {reviewThese.map((t) => (
                  <TxRow key={t.id} t={t} onUpdate={update} allCategories={allCategories} onCreateCategory={onCreateCategory} />
                ))}
              </div>
            </section>
          )}

          {/* Looks Good */}
          {lookingGood.length > 0 && (
            <section className="drawer-group">
              <button
                className="drawer-group-header good"
                onClick={() => setGoodExpanded((v) => !v)}
              >
                <span className="drawer-group-icon">✓</span>
                <span className="drawer-group-title">Looks Good</span>
                <span className="drawer-group-badge">{lookingGood.length}</span>
                <span className="drawer-group-chevron">{goodExpanded ? '▴' : '▾'}</span>
              </button>
              {goodExpanded && (
                <div className="drawer-group-rows">
                  {lookingGood.map((t) => (
                    <TxRow key={t.id} t={t} onUpdate={update} allCategories={allCategories} onCreateCategory={onCreateCategory} />
                  ))}
                </div>
              )}
            </section>
          )}

          {txns.length === 0 && (
            <div className="drawer-empty">No transactions found.</div>
          )}
        </div>

        {/* Footer */}
        <div className="drawer-footer">
          <button className="drawer-cancel-btn" onClick={onClose}>Cancel</button>
          <button className="drawer-save-btn" onClick={handleSave}>
            Save Statement
          </button>
        </div>
      </div>
    </div>
  );
}

function TxRow({ t, onUpdate, allCategories, onCreateCategory }) {
  return (
    <div className={`drawer-row ${t.isDeposit ? 'drawer-row-deposit' : ''}`}>
      <div className="drawer-row-date">{formatDate(t.date)}</div>
      <div className="drawer-row-desc">
        <span className="drawer-row-source">{t.description}</span>
        {t.activity && <span className="drawer-row-activity">{t.activity}</span>}
      </div>
      <div className={`drawer-row-amount ${t.isDeposit ? 'pos' : 'neg'}`}>
        {t.isDeposit ? '+' : '-'}{formatCurrency(Math.abs(t.amount))}
      </div>
      <div className="drawer-row-cat">
        {t.isDeposit ? (
          <span className="drawer-deposit-tag">Deposit</span>
        ) : (
          <CategorySelect
            value={t.category}
            categories={allCategories}
            onChange={(cat) => onUpdate(t.id, { category: cat })}
            onCreateCategory={onCreateCategory}
          />
        )}
      </div>
      <div className="drawer-row-recurring">
        {!t.isDeposit && (
          <label className="drawer-toggle" title="Recurring">
            <input
              type="checkbox"
              checked={t.isRecurring}
              onChange={(e) => onUpdate(t.id, { isRecurring: e.target.checked })}
            />
            <span className="drawer-toggle-slider" />
          </label>
        )}
      </div>
    </div>
  );
}
