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

  // Normalize merchants state
  const [normalizeState, setNormalizeState] = useState('idle'); // idle | loading | done | error
  const [normalizeResult, setNormalizeResult] = useState(null);

  // Rule tester state
  const [testerInput, setTesterInput] = useState('');
  const [testerResult, setTesterResult] = useState(null); // null | { matched, key?, category?, isRecurring?, normalizedInput }
  const [testerLoading, setTesterLoading] = useState(false);

  // Suggest new rules state
  const [suggestState, setSuggestState] = useState('idle'); // idle | loading | done | error
  const [suggestItems, setSuggestItems] = useState([]); // [{ normalizedKey, count, exampleDescription, redundantRules, status }]

  // Rule usage stats
  const [ruleStats, setRuleStats] = useState({}); // { [key]: { matchCount, lastMatchedDate } }

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch('/api/rules').then((r) => r.json()),
      fetch('/api/rules/stats').then((r) => r.json()),
    ])
      .then(([rulesData, statsData]) => {
        setRules(rulesData || {});
        setRuleStats(statsData || {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

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

  // ── Normalize merchants ──────────────────────────────────────────────────────
  const runNormalize = async () => {
    setNormalizeState('loading');
    setNormalizeResult(null);
    try {
      const res = await fetch('/api/admin/normalize-merchants', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Normalize failed.');
      setNormalizeResult(data);
      setNormalizeState('done');
    } catch (err) {
      setNormalizeResult({ error: err.message });
      setNormalizeState('error');
    }
  };

  const closeNormalize = () => { setNormalizeState('idle'); setNormalizeResult(null); };

  // ── Rule tester ──────────────────────────────────────────────────────────────
  const runTest = async (desc) => {
    const d = (desc !== undefined ? desc : testerInput).trim();
    if (!d) return;
    if (desc !== undefined) setTesterInput(desc);
    setTesterLoading(true);
    setTesterResult(null);
    try {
      const res = await fetch('/api/rules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: d }),
      });
      setTesterResult(await res.json());
    } catch { setTesterResult(null); }
    finally { setTesterLoading(false); }
  };

  // ── Suggest new rules ────────────────────────────────────────────────────────
  const runSuggest = async () => {
    setSuggestState('loading');
    setSuggestItems([]);
    try {
      const res = await fetch('/api/rules/suggestions');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load suggestions.');
      setSuggestItems((data || []).map((s) => ({ ...s, status: 'idle' }))); // status: idle | added | dismissed
      setSuggestState('done');
    } catch {
      setSuggestState('error');
    }
  };

  const closeSuggest = () => { setSuggestState('idle'); setSuggestItems([]); };

  const addSuggestedRule = async (normalizedKey, category, isRecurring) => {
    await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: normalizedKey, category, isRecurring: isRecurring ?? false }),
    });
    setRules((prev) => ({ ...prev, [normalizedKey]: { category, isRecurring: isRecurring ?? false } }));
    setSuggestItems((prev) =>
      prev.map((s) => s.normalizedKey === normalizedKey ? { ...s, status: 'added' } : s)
    );
    // Reload stats so the new rule shows up in the table
    fetch('/api/rules/stats').then((r) => r.json()).then((d) => setRuleStats(d || {})).catch(() => {});
  };

  const deleteRedundantRule = async (key) => {
    await fetch(`/api/rules/${encodeURIComponent(key)}`, { method: 'DELETE' });
    setRules((prev) => { const next = { ...prev }; delete next[key]; return next; });
    setSuggestItems((prev) =>
      prev.map((s) => ({
        ...s,
        redundantRules: s.redundantRules.filter((r) => r.key !== key),
      }))
    );
  };

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
          className="rules-normalize-btn"
          onClick={normalizeState === 'idle' ? runNormalize : closeNormalize}
          disabled={normalizeState === 'loading'}
          title="Group similar merchant descriptions across all statements and standardize them to the most recent name and category"
        >
          {normalizeState === 'loading' ? '…' : normalizeState !== 'idle' ? '✕ Close' : '⟳ Normalize Merchants'}
        </button>
        <button
          className="rules-suggest-btn"
          onClick={suggestState === 'idle' ? runSuggest : closeSuggest}
          disabled={suggestState === 'loading'}
          title="Find high-frequency merchants across all statements that don't have a rule yet"
        >
          {suggestState === 'loading' ? '…' : suggestState !== 'idle' ? '✕ Close' : '+ Suggest New Rules'}
        </button>
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

      {/* ── Normalize merchants panel ── */}
      {normalizeState !== 'idle' && (
        <div className="rules-normalize-panel">
          {normalizeState === 'loading' && (
            <p className="rules-normalize-status">Analyzing merchant names across all statements…</p>
          )}
          {normalizeState === 'error' && (
            <p className="rules-normalize-status error">{normalizeResult?.error}</p>
          )}
          {normalizeState === 'done' && normalizeResult && (
            <>
              {normalizeResult.transactionsUpdated === 0 ? (
                <p className="rules-normalize-status">All merchant names are already consistent — nothing to change.</p>
              ) : (
                <>
                  <p className="rules-normalize-summary">
                    Merged <strong>{normalizeResult.transactionsUpdated}</strong> transaction{normalizeResult.transactionsUpdated !== 1 ? 's' : ''} across{' '}
                    <strong>{normalizeResult.clustersFound}</strong> merchant group{normalizeResult.clustersFound !== 1 ? 's' : ''}.
                  </p>
                  {normalizeResult.changes?.length > 0 && (
                    <div className="rules-normalize-changes">
                      {normalizeResult.changes.map((c, i) => (
                        <div key={i} className="rules-normalize-cluster">
                          <span className="rules-normalize-canonical">{c.canonical}</span>
                          <span className="rules-normalize-cat">{c.canonicalCategory}</span>
                          <div className="rules-normalize-aliases">
                            {c.merged.map((m, j) => (
                              <span key={j} className="rules-normalize-alias">
                                {m.from}{m.fromCategory !== c.canonicalCategory ? ` (was: ${m.fromCategory})` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              <div className="rules-normalize-actions">
                <button className="rules-refine-close" onClick={closeNormalize}>Done</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Rule tester ── */}
      <div className="rules-tester">
        <div className="rules-tester-row">
          <input
            className="rules-tester-input"
            type="text"
            placeholder="Paste any raw transaction description to test against your rules…"
            value={testerInput}
            onChange={(e) => { setTesterInput(e.target.value); setTesterResult(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') runTest(); }}
            spellCheck={false}
          />
          <button
            className="rules-tester-btn"
            onClick={() => runTest()}
            disabled={!testerInput.trim() || testerLoading}
          >
            {testerLoading ? '…' : 'Test'}
          </button>
        </div>
        {testerResult && (
          <div className={`rules-tester-result ${testerResult.matched ? 'matched' : 'unmatched'}`}>
            <span className="rules-tester-norm">
              Normalized: <code>{testerResult.normalizedInput}</code>
            </span>
            {testerResult.matched ? (
              <>
                <span className="rules-tester-sep">·</span>
                <span className="rules-tester-hit">
                  Rule: <code>{testerResult.key}</code>
                </span>
                <span className="rules-tester-cat">
                  {testerResult.category}
                  {testerResult.isRecurring ? ' · recurring' : ''}
                </span>
              </>
            ) : (
              <>
                <span className="rules-tester-sep">·</span>
                <span className="rules-tester-miss">No rule matched — AI will categorize</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Suggest new rules panel ── */}
      {suggestState !== 'idle' && (
        <div className="rules-suggest-panel">
          {suggestState === 'loading' && (
            <p className="rules-suggest-status">Scanning all statements for unruled merchants…</p>
          )}
          {suggestState === 'error' && (
            <p className="rules-suggest-status error">Failed to load suggestions.</p>
          )}
          {suggestState === 'done' && (
            <>
              {suggestItems.length === 0 ? (
                <p className="rules-suggest-status">All frequent merchants already have a rule — great coverage.</p>
              ) : (
                <>
                  <p className="rules-suggest-title">
                    {suggestItems.length} merchant{suggestItems.length !== 1 ? 's' : ''} appear frequently without a rule:
                  </p>
                  <div className="rules-suggest-list">
                    {suggestItems.map((s) => (
                      <SuggestItem
                        key={s.normalizedKey}
                        item={s}
                        allCategories={dropdownCategories}
                        onTest={() => runTest(s.exampleDescription)}
                        onAdd={(cat, recurring) => addSuggestedRule(s.normalizedKey, cat, recurring)}
                        onDeleteRedundant={deleteRedundantRule}
                      />
                    ))}
                  </div>
                </>
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
                <th>Usage</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(({ merchant, category, isRecurring }) => {
                const isEditing = editingKey === merchant;
                const stat = ruleStats[merchant];
                const isStale = !isEditing && stat && stat.matchCount === 0;
                return (
                  <tr key={merchant} className={isEditing ? 'rules-row-editing' : isStale ? 'rules-row-stale' : ''}>
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
                        <td />
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
                        <td className="rules-usage">
                          {(() => {
                            const s = ruleStats[merchant];
                            if (!s || s.matchCount === 0) {
                              return <span className="rules-usage-none">—</span>;
                            }
                            const daysAgo = s.lastMatchedDate
                              ? Math.floor((Date.now() - new Date(s.lastMatchedDate)) / 86400000)
                              : null;
                            return (
                              <span
                                className="rules-usage-stat"
                                title={`Last matched: ${s.lastMatchedDate}`}
                              >
                                {s.matchCount}x{daysAgo !== null ? ` · ${daysAgo}d ago` : ''}
                              </span>
                            );
                          })()}
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

// ── Suggest item ─────────────────────────────────────────────────────────────

function SuggestItem({ item, allCategories, onTest, onAdd, onDeleteRedundant }) {
  const { normalizedKey, count, redundantRules, status } = item;
  const [selectedCat, setSelectedCat] = useState(allCategories[0] || '');
  const [isRecurring, setIsRecurring] = useState(false);

  if (status === 'added') {
    return (
      <div className="rules-suggest-item rules-suggest-item-done">
        <span className="rules-suggest-key">{normalizedKey}</span>
        <span className="rules-suggest-added">✓ Rule added</span>
      </div>
    );
  }

  return (
    <div className="rules-suggest-item">
      <div className="rules-suggest-item-main">
        <span className="rules-suggest-key">{normalizedKey}</span>
        <span className="rules-suggest-count">{count}x</span>
        <select
          className="rules-suggest-cat-select"
          value={selectedCat}
          onChange={(e) => setSelectedCat(e.target.value)}
        >
          {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="rules-suggest-recur">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
          />
          recurring
        </label>
        <button className="rules-suggest-test-btn" onClick={onTest} title="Test in rule tester above">
          Test
        </button>
        <button
          className="rules-suggest-add-btn"
          onClick={() => onAdd(selectedCat, isRecurring)}
        >
          Add Rule
        </button>
      </div>
      {redundantRules.length > 0 && (
        <div className="rules-suggest-redundant">
          <span className="rules-suggest-redundant-label">
            Adding this rule would subsume:
          </span>
          {redundantRules.map((r) => (
            <span key={r.key} className="rules-suggest-redundant-item">
              <code>{r.key}</code>
              <span className="rules-suggest-redundant-cat">{r.category}</span>
              <button
                className="rules-suggest-redundant-del"
                onClick={() => onDeleteRedundant(r.key)}
                title="Delete this narrower rule since the new one would cover it"
              >
                Delete
              </button>
            </span>
          ))}
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
