import { useState, useMemo } from 'react';
import CategorySelect from '../shared/CategorySelect.jsx';
import RuleToast from '../shared/RuleToast.jsx';
import { useRuleToast } from '../../hooks/useRuleToast.js';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import './ReviewModal.css';

export default function ReviewModal({
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
  const { pendingRule, triggerToast, saveRule, dismissToast } = useRuleToast();

  const update = (id, updates) => {
    setTxns((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    if (updates.category !== undefined) {
      const txn = txns.find((t) => t.id === id);
      if (txn) triggerToast(txn.description, updates.category);
    }
  };

  const { needsReview, looksGood } = useMemo(() => ({
    needsReview: txns.filter((t) => !t.ruleApplied && !t.isDeposit),
    looksGood:   txns.filter((t) =>  t.ruleApplied ||  t.isDeposit),
  }), [txns]);

  const totalExpenses = txns
    .filter((t) => !t.isDeposit)
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const handleSave = () =>
    onSave(name.trim() || defaultName || 'Untitled Statement', txns);

  return (
    <div className="rm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rm-modal">

        {/* Header */}
        <div className="rm-header">
          <div className="rm-header-left">
            <h2 className="rm-title">Review &amp; Save</h2>
            <span className="rm-meta">{txns.length} transactions · {formatCurrency(totalExpenses)} expenses</span>
          </div>
          <input
            className="rm-name-input"
            type="text"
            placeholder="Statement name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
          <button className="rm-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Body */}
        <div className="rm-body">
          <table className="rm-table">
            <thead>
              <tr>
                <th className="rm-col-date">Date</th>
                <th className="rm-col-desc">Description</th>
                <th className="rm-col-amount">Amount</th>
                <th className="rm-col-cat">Category</th>
                <th className="rm-col-rec">Recurring</th>
              </tr>
            </thead>
            <tbody>
              {/* Needs Review */}
              {needsReview.length > 0 && (
                <>
                  <tr className="rm-section-row review">
                    <td colSpan={5}>
                      <span className="rm-section-icon">⚠</span>
                      Needs Review
                      <span className="rm-section-badge">{needsReview.length}</span>
                    </td>
                  </tr>
                  {needsReview.map((t) => (
                    <TxRow key={t.id} t={t} onUpdate={update} allCategories={allCategories} onCreateCategory={onCreateCategory} />
                  ))}
                </>
              )}

              {/* Looks Good */}
              {looksGood.length > 0 && (
                <>
                  <tr
                    className="rm-section-row good clickable"
                    onClick={() => setGoodExpanded((v) => !v)}
                  >
                    <td colSpan={5}>
                      <span className="rm-section-icon">✓</span>
                      Looks Good
                      <span className="rm-section-badge">{looksGood.length}</span>
                      <span className="rm-section-chevron">{goodExpanded ? '▴' : '▾'}</span>
                    </td>
                  </tr>
                  {goodExpanded && looksGood.map((t) => (
                    <TxRow key={t.id} t={t} onUpdate={update} allCategories={allCategories} onCreateCategory={onCreateCategory} />
                  ))}
                </>
              )}
            </tbody>
          </table>

          {txns.length === 0 && (
            <div className="rm-empty">No transactions found.</div>
          )}
        </div>

        {/* Footer */}
        <div className="rm-footer">
          <button className="rm-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="rm-btn-save" onClick={handleSave}>Save Statement</button>
        </div>
      </div>

      <RuleToast pendingRule={pendingRule} onSave={saveRule} onDismiss={dismissToast} />
    </div>
  );
}

function TxRow({ t, onUpdate, allCategories, onCreateCategory }) {
  return (
    <tr className={`rm-row${t.isDeposit ? ' rm-row-deposit' : ''}`}>
      <td className="rm-col-date">{formatDate(t.date)}</td>
      <td className="rm-col-desc">
        <span className="rm-source">{t.description}</span>
        {t.activity && <span className="rm-activity">{t.activity}</span>}
      </td>
      <td className={`rm-col-amount ${t.isDeposit ? 'pos' : 'neg'}`}>
        {t.isDeposit ? '+' : '-'}{formatCurrency(Math.abs(t.amount))}
      </td>
      <td className="rm-col-cat">
        {t.isDeposit ? (
          <span className="rm-deposit-tag">Deposit</span>
        ) : (
          <CategorySelect
            value={t.category}
            categories={allCategories}
            onChange={(cat) => onUpdate(t.id, { category: cat })}
            onCreateCategory={onCreateCategory}
          />
        )}
      </td>
      <td className="rm-col-rec">
        {!t.isDeposit && (
          <label className="rm-toggle" title="Recurring">
            <input
              type="checkbox"
              checked={t.isRecurring}
              onChange={(e) => onUpdate(t.id, { isRecurring: e.target.checked })}
            />
            <span className="rm-toggle-slider" />
          </label>
        )}
      </td>
    </tr>
  );
}
