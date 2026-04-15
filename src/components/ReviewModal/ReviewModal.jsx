import { useState, useMemo } from 'react';
import CategorySelect from '../shared/CategorySelect.jsx';
import RuleToast from '../shared/RuleToast.jsx';
import { useRuleToast } from '../../hooks/useRuleToast.js';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import './ReviewModal.css';

/**
 * ReviewModal — supports single or multi-month groups.
 *
 * Props:
 *   groups          [{ ym, name, transactions }]  — always an array
 *   allCategories   string[]
 *   onCreateCategory (name) => void
 *   onSave          (groups: { name, transactions }[]) => void
 *   onClose         () => void
 */
export default function ReviewModal({
  groups: initialGroups,
  allCategories,
  onCreateCategory,
  onSave,
  onClose,
}) {
  const multiMonth = initialGroups.length > 1;

  // Per-group state: { name, txns, goodExpanded }
  const [groupStates, setGroupStates] = useState(() =>
    initialGroups.map((g) => ({
      name: g.name,
      txns: g.transactions,
      goodExpanded: false,
    }))
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const { pendingRule, triggerToast, saveRule, dismissToast } = useRuleToast();

  const active = groupStates[activeIdx];

  const setActiveProp = (prop, value) =>
    setGroupStates((prev) =>
      prev.map((gs, i) => (i === activeIdx ? { ...gs, [prop]: value } : gs))
    );

  const updateTxn = (id, updates) => {
    setGroupStates((prev) =>
      prev.map((gs, i) => {
        if (i !== activeIdx) return gs;
        return { ...gs, txns: gs.txns.map((t) => (t.id === id ? { ...t, ...updates } : t)) };
      })
    );
    if (updates.category !== undefined) {
      const txn = active.txns.find((t) => t.id === id);
      if (txn) triggerToast(txn.description, updates.category, txn.isRecurring);
    }
  };

  const { needsReview, looksGood } = useMemo(() => ({
    needsReview: active.txns.filter((t) => !t.ruleApplied && !t.isDeposit),
    looksGood:   active.txns.filter((t) =>  t.ruleApplied ||  t.isDeposit),
  }), [active.txns]);

  const activeTotalExpenses = active.txns
    .filter((t) => !t.isDeposit)
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const handleSave = () =>
    onSave(groupStates.map((gs) => ({ name: gs.name.trim() || gs.name, transactions: gs.txns })));

  // Count total "needs review" across all groups (for tab badges)
  const reviewCounts = useMemo(() =>
    groupStates.map((gs) => gs.txns.filter((t) => !t.ruleApplied && !t.isDeposit).length),
    [groupStates]
  );

  const totalStatements = groupStates.length;

  return (
    <div className="rm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rm-modal">

        {/* Month tabs (only for multi-month uploads) */}
        {multiMonth && (
          <div className="rm-tabs">
            {groupStates.map((gs, i) => (
              <button
                key={initialGroups[i].ym}
                className={`rm-tab${activeIdx === i ? ' active' : ''}`}
                onClick={() => setActiveIdx(i)}
              >
                {gs.name}
                {reviewCounts[i] > 0 && (
                  <span className="rm-tab-badge">{reviewCounts[i]}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="rm-header">
          <div className="rm-header-left">
            <h2 className="rm-title">
              {multiMonth ? 'Review & Save — Multi-Month' : 'Review & Save'}
            </h2>
            <span className="rm-meta">
              {active.txns.length} transactions · {formatCurrency(activeTotalExpenses)} expenses
              {multiMonth && ` · ${totalStatements} months`}
            </span>
          </div>
          <input
            className="rm-name-input"
            type="text"
            placeholder="Statement name…"
            value={active.name}
            onChange={(e) => setActiveProp('name', e.target.value)}
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
                    <TxRow
                      key={t.id} t={t}
                      onUpdate={updateTxn}
                      allCategories={allCategories}
                      onCreateCategory={onCreateCategory}
                    />
                  ))}
                </>
              )}

              {/* Looks Good */}
              {looksGood.length > 0 && (
                <>
                  <tr
                    className="rm-section-row good clickable"
                    onClick={() => setActiveProp('goodExpanded', !active.goodExpanded)}
                  >
                    <td colSpan={5}>
                      <span className="rm-section-icon">✓</span>
                      Looks Good
                      <span className="rm-section-badge">{looksGood.length}</span>
                      <span className="rm-section-chevron">{active.goodExpanded ? '▴' : '▾'}</span>
                    </td>
                  </tr>
                  {active.goodExpanded && looksGood.map((t) => (
                    <TxRow
                      key={t.id} t={t}
                      onUpdate={updateTxn}
                      allCategories={allCategories}
                      onCreateCategory={onCreateCategory}
                    />
                  ))}
                </>
              )}
            </tbody>
          </table>

          {active.txns.length === 0 && (
            <div className="rm-empty">No transactions found in this month.</div>
          )}
        </div>

        {/* Footer */}
        <div className="rm-footer">
          {multiMonth && (
            <div className="rm-footer-nav">
              <button
                className="rm-btn-nav"
                disabled={activeIdx === 0}
                onClick={() => setActiveIdx((i) => i - 1)}
              >
                ← Prev
              </button>
              <span className="rm-footer-page">{activeIdx + 1} / {totalStatements}</span>
              <button
                className="rm-btn-nav"
                disabled={activeIdx === totalStatements - 1}
                onClick={() => setActiveIdx((i) => i + 1)}
              >
                Next →
              </button>
            </div>
          )}
          <button className="rm-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="rm-btn-save" onClick={handleSave}>
            {multiMonth ? `Save All ${totalStatements} Statements` : 'Save Statement'}
          </button>
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
