import { useState, useEffect, useMemo } from 'react';
import { useCategories } from '../../hooks/useCategories.js';
import './RulesPage.css';

function toRule(value) {
  if (typeof value === 'string') return { category: value, isRecurring: false };
  return value;
}

const SUGGESTION_META = {
  delete:       { label: 'Redundant',    cls: 'red'    },
  recategorize: { label: 'Recategorize', cls: 'accent' },
  consolidate:  { label: 'Duplicate',    cls: 'warn'   },
  conflict:     { label: 'Conflict',     cls: 'orange' },
};

export default function RulesPage() {
  const { allCategories } = useCategories();
  const [rules, setRules] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Edit state
  const [editingKey, setEditingKey] = useState(null);
  const [editForm, setEditForm] = useState({ editKey: '', category: '', isRecurring: false });

  // Refine state
  const [refineState, setRefineState] = useState('idle'); // idle | loading | done | error
  const [refineSummary, setRefineSummary] = useState('');
  const [suggestions, setSuggestions] = useState([]); // [{ ...fields, status: 'pending'|'approved'|'denied' }]
  const [applying, setApplying] = useState(false);

  const load = () =>
    fetch('/api/rules')
      .then((r) => r.json())
      .then((data) => setRules(data || {}))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async (key) => {
    await fetch(`/api/rules/${encodeURIComponent(key)}`, { method: 'DELETE' });
    setRules((prev) => { const next = { ...prev }; delete next[key]; return next; });
    if (editingKey === key) setEditingKey(null);
  };

  // ── Edit ─────────────────────────────────────────────────────────────────────
  const startEdit = (key, rule) => {
    setEditingKey(key);
    setEditForm({ editKey: key, category: rule.category, isRecurring: rule.isRecurring });
  };
  const cancelEdit = () => setEditingKey(null);
  const saveEdit = async () => {
    const { editKey, category, isRecurring } = editForm;
    const newKey = editKey.trim();
    if (!newKey) return;
    await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: newKey, category, isRecurring }),
    });
    if (newKey !== editingKey) {
      await fetch(`/api/rules/${encodeURIComponent(editingKey)}`, { method: 'DELETE' });
    }
    setRules((prev) => {
      const next = { ...prev };
      if (newKey !== editingKey) delete next[editingKey];
      next[newKey] = { category, isRecurring };
      return next;
    });
    setEditingKey(null);
  };

  // ── Refine: fetch suggestions ────────────────────────────────────────────────
  const runRefine = async () => {
    setRefineState('loading');
    setSuggestions([]);
    setRefineSummary('');
    try {
      const res = await fetch('/api/rules/refine', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refine failed.');
      setSuggestions((data.suggestions || []).map((s) => ({ ...s, status: 'pending' })));
      setRefineSummary(data.summary || '');
      setRefineState('done');
    } catch (err) {
      setRefineSummary(err.message);
      setRefineState('error');
    }
  };

  // ── Approve / deny individual suggestions ────────────────────────────────────
  const setSuggestionStatus = (idx, status, extra = {}) =>
    setSuggestions((prev) => prev.map((s, i) => i === idx ? { ...s, status, ...extra } : s));

  // ── Apply all approved suggestions ──────────────────────────────────────────
  const applyApproved = async () => {
    const approved = suggestions.filter((s) => s.status === 'approved');
    if (approved.length === 0) return;
    setApplying(true);

    for (const s of approved) {
      try {
        if (s.type === 'delete') {
          await fetch(`/api/rules/${encodeURIComponent(s.key)}`, { method: 'DELETE' });
          setRules((prev) => { const next = { ...prev }; delete next[s.key]; return next; });

        } else if (s.type === 'recategorize') {
          await fetch('/api/rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant: s.key, category: s.newCategory, isRecurring: s.newIsRecurring }),
          });
          setRules((prev) => ({ ...prev, [s.key]: { category: s.newCategory, isRecurring: s.newIsRecurring } }));

        } else if (s.type === 'consolidate') {
          await fetch(`/api/rules/${encodeURIComponent(s.deleteKey)}`, { method: 'DELETE' });
          setRules((prev) => { const next = { ...prev }; delete next[s.deleteKey]; return next; });

        } else if (s.type === 'conflict') {
          // chosenKey is the rule to KEEP — delete the other one
          const toDelete = s.chosenKey === s.keepKey ? s.deleteKey : s.keepKey;
          await fetch(`/api/rules/${encodeURIComponent(toDelete)}`, { method: 'DELETE' });
          setRules((prev) => { const next = { ...prev }; delete next[toDelete]; return next; });
        }
      } catch { /* individual failures are silent; rule table will reflect actual state */ }
    }

    // Mark all approved as done, keep denied as denied
    setSuggestions((prev) =>
      prev.map((s) => s.status === 'approved' ? { ...s, status: 'done' } : s)
    );
    setApplying(false);
  };

  const closeRefine = () => { setRefineState('idle'); setSuggestions([]); setRefineSummary(''); };

  // ── Category dropdown: base list + any category already in use in rules ─────
  const dropdownCategories = useMemo(() => {
    const inRules = Object.values(rules).map((v) => (typeof v === 'string' ? v : v.category));
    return [...new Set([...allCategories, ...inRules])].filter(Boolean).sort();
  }, [allCategories, rules]);

  // ── Table entries ────────────────────────────────────────────────────────────
  const entries = Object.entries(rules)
    .map(([merchant, value]) => ({ merchant, ...toRule(value) }))
    .filter(({ merchant, category }) =>
      !search.trim() ||
      merchant.toLowerCase().includes(search.toLowerCase()) ||
      category.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => a.merchant.localeCompare(b.merchant));

  const approvedCount = suggestions.filter((s) => s.status === 'approved').length;
  const pendingCount  = suggestions.filter((s) => s.status === 'pending').length;
  const allResolved   = suggestions.length > 0 && pendingCount === 0;

  return (
    <div className="rules-page">

      {/* ── Header ── */}
      <div className="rules-header">
        <div className="rules-header-left">
          <h1>Rules</h1>
          {!loading && <span className="rules-count">{Object.keys(rules).length} rules</span>}
        </div>
        <input
          className="rules-search"
          type="text"
          placeholder="Search merchant or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="rules-refine-btn"
          onClick={refineState === 'idle' ? runRefine : closeRefine}
          disabled={refineState === 'loading' || Object.keys(rules).length < 2}
        >
          {refineState === 'loading' ? '…' : refineState !== 'idle' ? '✕ Close' : '✦ Refine with AI'}
        </button>
      </div>

      {/* ── Refine panel ── */}
      {refineState !== 'idle' && (
        <div className="rules-refine-panel">

          {refineState === 'loading' && (
            <p className="rules-refine-status">Analyzing your rules…</p>
          )}

          {refineState === 'error' && (
            <p className="rules-refine-status error">{refineSummary}</p>
          )}

          {refineState === 'done' && (
            <>
              {refineSummary && (
                <p className="rules-refine-summary">{refineSummary}</p>
              )}

              {suggestions.length === 0 ? (
                <p className="rules-refine-status">No changes needed — your rules look clean.</p>
              ) : (
                <div className="rules-suggestions">
                  {suggestions.map((s, idx) => (
                    <SuggestionCard
                      key={idx}
                      suggestion={s}
                      onApprove={(extra) => setSuggestionStatus(idx, 'approved', extra)}
                      onDeny={() => setSuggestionStatus(idx, 'denied')}
                      onUndo={() => setSuggestionStatus(idx, 'pending', { chosenKey: undefined })}
                    />
                  ))}
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="rules-refine-actions">
                  {!allResolved && (
                    <span className="rules-refine-pending">{pendingCount} pending</span>
                  )}
                  <button
                    className="rules-refine-apply"
                    onClick={applyApproved}
                    disabled={approvedCount === 0 || applying}
                  >
                    {applying ? 'Applying…' : `Apply ${approvedCount} approved`}
                  </button>
                  <button className="rules-refine-close" onClick={closeRefine}>
                    {allResolved ? 'Done' : 'Dismiss'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Table ── */}
      {loading ? (
        <div className="rules-loading">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="rules-empty">
          {Object.keys(rules).length === 0
            ? 'No rules yet. Change a transaction category and confirm the toast to create one.'
            : 'No rules match your search.'}
        </div>
      ) : (
        <div className="rules-table-wrap">
          <table className="rules-table">
            <thead>
              <tr>
                <th>Merchant key</th>
                <th>Category</th>
                <th>Recurring</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(({ merchant, category, isRecurring }) => {
                const isEditing = editingKey === merchant;
                return (
                  <tr key={merchant} className={isEditing ? 'rules-row-editing' : ''}>
                    {isEditing ? (
                      <>
                        <td className="rules-merchant-edit">
                          <input
                            className="rules-edit-key"
                            type="text"
                            value={editForm.editKey}
                            onChange={(e) => setEditForm((f) => ({ ...f, editKey: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                            autoFocus
                            spellCheck={false}
                          />
                        </td>
                        <td className="rules-cat-edit">
                          <select
                            className="rules-edit-select"
                            value={editForm.category}
                            onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                          >
                            {dropdownCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="rules-recurring-edit">
                          <label className="rules-recur-check">
                            <input
                              type="checkbox"
                              checked={editForm.isRecurring}
                              onChange={(e) => setEditForm((f) => ({ ...f, isRecurring: e.target.checked }))}
                            />
                            <span>recurring</span>
                          </label>
                        </td>
                        <td className="rules-actions">
                          <div className="rules-edit-btns">
                            <button className="rules-save-btn" onClick={saveEdit}>Save</button>
                            <button className="rules-cancel-btn" onClick={cancelEdit}>Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="rules-merchant">{merchant}</td>
                        <td className="rules-category">{category}</td>
                        <td className="rules-recurring">
                          {isRecurring && <span className="rules-recurring-badge">↻ recurring</span>}
                        </td>
                        <td className="rules-actions">
                          <div className="rules-action-btns">
                            <button className="rules-edit-btn" onClick={() => startEdit(merchant, { category, isRecurring })}>Edit</button>
                            <button className="rules-delete-btn" onClick={() => handleDelete(merchant)}>Delete</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Suggestion card ──────────────────────────────────────────────────────────

function SuggestionCard({ suggestion, onApprove, onDeny, onUndo }) {
  const { type, status } = suggestion;
  const meta = SUGGESTION_META[type] || { label: type, cls: 'info' };

  const descriptionEl = (() => {
    if (type === 'delete') {
      return (
        <div className="sg-change">
          <span className="sg-key">{suggestion.key}</span>
          <span className="sg-arrow">→</span>
          <span className="sg-tag delete">delete</span>
          <span className="sg-cat">{suggestion.currentCategory}</span>
        </div>
      );
    }
    if (type === 'recategorize') {
      return (
        <div className="sg-change">
          <span className="sg-key">{suggestion.key}</span>
          <span className="sg-arrow">:</span>
          <span className="sg-cat old">{suggestion.currentCategory}</span>
          <span className="sg-arrow">→</span>
          <span className="sg-cat new">{suggestion.newCategory}</span>
          {suggestion.newIsRecurring && !suggestion.currentIsRecurring && (
            <span className="sg-recurring-tag">+ recurring</span>
          )}
        </div>
      );
    }
    if (type === 'consolidate') {
      return (
        <div className="sg-change">
          <span className="sg-tag delete">{suggestion.deleteKey}</span>
          <span className="sg-arrow">→</span>
          <span className="sg-tag keep">{suggestion.keepKey}</span>
          <span className="sg-cat">{suggestion.category}</span>
        </div>
      );
    }
    if (type === 'conflict') {
      return (
        <div className="sg-change">
          <span className="sg-key">{suggestion.keepKey}</span>
          <span className="sg-cat">{suggestion.keepCategory}</span>
          <span className="sg-arrow">vs</span>
          <span className="sg-key">{suggestion.deleteKey}</span>
          <span className="sg-cat">{suggestion.deleteCategory}</span>
        </div>
      );
    }
    return null;
  })();

  return (
    <div className={`sg-card sg-card-${status}`}>
      <div className="sg-header">
        <span className={`sg-badge sg-badge-${meta.cls}`}>{meta.label}</span>
        {descriptionEl}
      </div>
      <p className="sg-reason">{suggestion.reason}</p>
      <div className="sg-actions">
        {type === 'conflict' ? (
          <>
            {status === 'pending' && (
              <>
                <button className="sg-btn-keep" onClick={() => onApprove({ chosenKey: suggestion.keepKey })}>
                  Keep &ldquo;{suggestion.keepKey}&rdquo;
                </button>
                <button className="sg-btn-keep" onClick={() => onApprove({ chosenKey: suggestion.deleteKey })}>
                  Keep &ldquo;{suggestion.deleteKey}&rdquo;
                </button>
                <button className="sg-btn-deny" onClick={onDeny}>✗ Skip</button>
              </>
            )}
            {status === 'approved' && (
              <button className="sg-btn-undo sg-approved" onClick={onUndo}>
                Keeping &ldquo;{suggestion.chosenKey}&rdquo; — undo
              </button>
            )}
            {status === 'denied' && (
              <button className="sg-btn-undo sg-denied" onClick={onUndo}>✗ Skipped — undo</button>
            )}
            {status === 'done' && (
              <span className="sg-done">✓ Applied — kept &ldquo;{suggestion.chosenKey}&rdquo;</span>
            )}
          </>
        ) : (
          <>
            {status === 'pending' && (
              <>
                <button className="sg-btn-approve" onClick={() => onApprove()}>✓ Approve</button>
                <button className="sg-btn-deny" onClick={onDeny}>✗ Skip</button>
              </>
            )}
            {status === 'approved' && (
              <button className="sg-btn-undo sg-approved" onClick={onUndo}>✓ Approved — undo</button>
            )}
            {status === 'denied' && (
              <button className="sg-btn-undo sg-denied" onClick={onUndo}>✗ Skipped — undo</button>
            )}
            {status === 'done' && (
              <span className="sg-done">✓ Applied</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
