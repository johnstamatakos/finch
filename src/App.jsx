import { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import AppShell from './components/AppShell/AppShell.jsx';
import UploadModal from './components/UploadModal/UploadModal.jsx';
import ReviewModal from './components/ReviewModal/ReviewModal.jsx';
import DashboardPage from './pages/DashboardPage/DashboardPage.jsx';
import TransactionsPage from './pages/TransactionsPage/TransactionsPage.jsx';
import StatementsPage from './pages/StatementsPage/StatementsPage.jsx';
import RulesPage from './pages/RulesPage/RulesPage.jsx';
import LoadingSpinner from './components/shared/LoadingSpinner.jsx';
import ErrorBanner from './components/shared/ErrorBanner.jsx';
import { useCategories } from './hooks/useCategories.js';
import { CATEGORIES } from './constants/categories.js';
import './App.css';

export default function App() {
  const { allCategories, addCategory } = useCategories();

  // ── Navigation ───────────────────────────────────────────────────────────
  const [page, setPage] = useState('dashboard');

  // ── Statement data ───────────────────────────────────────────────────────
  const [savedStatements, setSavedStatements] = useState([]);
  const [selectedId, setSelectedId] = useState(null); // null = All Time

  // ── Upload + Review flow ─────────────────────────────────────────────────
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reviewData, setReviewData] = useState(null); // { groups: [{ ym, name, transactions, existingStatementId? }] }

  // ── Plaid bank sync ──────────────────────────────────────────────────────
  const [isConnected, setIsConnected] = useState(false);
  const [syncState, setSyncState] = useState('idle'); // 'idle' | 'linking' | 'syncing'
  const [linkToken, setLinkToken] = useState(null);

  // ── Transaction filters ───────────────────────────────────────────────────
  const [txFilters, setTxFilters] = useState({
    type: '', category: '', minAmount: '', maxAmount: '',
    noRuleOnly: false, flaggedOnly: false, sortBy: 'date', sortDir: 'desc',
  });
  const setTxFilter = (key, value) => setTxFilters((f) => ({ ...f, [key]: value }));

  // ── Budget goal (persisted in localStorage) ──────────────────────────────
  const [budgetGoal, setBudgetGoalState] = useState(() => {
    const stored = localStorage.getItem('finch_budget_goal');
    return stored ? parseFloat(stored) : 0;
  });

  const setBudgetGoal = (val) => {
    setBudgetGoalState(val);
    if (val > 0) localStorage.setItem('finch_budget_goal', String(val));
    else localStorage.removeItem('finch_budget_goal');
  };

  // ── Global UI state ──────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Plaid Link setup ─────────────────────────────────────────────────────
  const handlePlaidSuccess = useCallback(async (publicToken) => {
    setSyncState('syncing');
    try {
      const exchRes = await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicToken }),
      });
      if (!exchRes.ok) throw new Error('Failed to connect account.');
      setIsConnected(true);
      setLinkToken(null);
      await handleSync();
    } catch (err) {
      setError(err.message);
      setSyncState('idle');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { open: openPlaidLink, ready: plaidReady } = usePlaidLink({
    token: linkToken,
    onSuccess: handlePlaidSuccess,
    onExit: () => { setSyncState('idle'); setLinkToken(null); },
  });

  // Open Plaid Link as soon as the token is ready
  useEffect(() => {
    if (linkToken && plaidReady) openPlaidLink();
  }, [linkToken, plaidReady, openPlaidLink]);

  // ── Load statements on mount ─────────────────────────────────────────────
  useEffect(() => {
    refreshStatements();
    fetch('/api/plaid/status').then((r) => r.json()).then((d) => setIsConnected(!!d.connected)).catch(() => {});
  }, []);

  const refreshStatements = () =>
    fetch('/api/statements')
      .then((r) => r.json())
      .then((data) => setSavedStatements(Array.isArray(data) ? data : []))
      .catch(() => {});

  // ── Analyze uploaded file ─────────────────────────────────────────────────
  const handleAnalyze = async (file) => {
    setIsLoading(true);
    setError(null);
    setUploadOpen(false);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/analyze', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed. Please try again.');

      // Split into per-month groups automatically (duplicates already filtered server-side)
      setReviewData({
        groups: splitByMonth(data.transactions),
        duplicateCount: data.duplicateCount || 0,
      });
    } catch (err) {
      setError(err.message);
      setUploadOpen(true); // reopen so they can retry
    } finally {
      setIsLoading(false);
    }
  };

  // ── Plaid sync ───────────────────────────────────────────────────────────
  const handleSync = async () => {
    setSyncState('syncing');
    setError(null);
    try {
      const res = await fetch('/api/plaid/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed.');
      if (data.groups && data.groups.length > 0) {
        setReviewData({ groups: data.groups, duplicateCount: data.duplicateCount || 0, cursor: data.cursor });
      } else {
        setError(data.message || 'No new transactions found.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncState('idle');
    }
  };

  const handleSyncClick = async () => {
    if (syncState !== 'idle') return;
    if (isConnected) {
      await handleSync();
    } else {
      setSyncState('linking');
      setError(null);
      try {
        const res = await fetch('/api/plaid/link-token', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to connect to bank.');
        setLinkToken(data.linkToken); // triggers useEffect → openPlaidLink()
      } catch (err) {
        setError(err.message);
        setSyncState('idle');
      }
    }
  };

  // ── Save new statement(s) from review modal ───────────────────────────────
  // groups = [{ name, transactions }]  (always an array, even for single month)
  const handleSaveNew = async (groups) => {
    setIsLoading(true);
    setError(null);
    try {
      let savedCount = 0;
      let skippedCount = 0;
      let totalDupes = 0;

      // Save sequentially so fingerprint dedup works correctly across months
      for (const group of groups) {
        if (group.existingStatementId) {
          // Plaid sync: append new transactions to existing month statement
          const res = await fetch(`/api/statements/${group.existingStatementId}/append`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactions: group.transactions }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Append failed.');
          savedCount++;
          totalDupes += group.transactions.length - (data.appendedCount || 0);
        } else {
          const res = await fetch('/api/statements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: group.name, monthlyIncome: 0, transactions: group.transactions }),
          });
          const data = await res.json();
          if (res.status === 409) {
            skippedCount++;
          } else if (!res.ok) {
            throw new Error(data.error || 'Save failed.');
          } else {
            savedCount++;
            totalDupes += data.duplicateCount || 0;
          }
        }
      }

      // Advance the Plaid cursor only after all groups are confirmed saved
      if (reviewData.cursor) {
        await fetch('/api/plaid/advance-cursor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursor: reviewData.cursor }),
        });
      }

      setReviewData(null);
      await refreshStatements();
      setPage('dashboard');

      if (skippedCount > 0 || totalDupes > 0) {
        let msg = savedCount > 0 ? `Saved ${savedCount} statement${savedCount !== 1 ? 's' : ''}.` : '';
        if (skippedCount > 0) msg += ` ${skippedCount} month${skippedCount !== 1 ? 's' : ''} already existed and were skipped.`;
        if (totalDupes > 0) msg += ` ${totalDupes} duplicate transaction${totalDupes !== 1 ? 's' : ''} skipped.`;
        setError(msg.trim());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Rename statement ──────────────────────────────────────────────────────
  const handleRename = async (id, newName) => {
    const res = await fetch(`/api/statements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    if (res.ok) await refreshStatements();
  };

  // ── Delete statement ──────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this statement? This cannot be undone.')) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/statements/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed.');
      }
      if (selectedId === id) setSelectedId(null);
      await refreshStatements();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const sortedStatements = [...savedStatements].sort((a, b) => {
    const aKey = (a.period?.year ?? 0) * 12 + (a.period?.month ?? 0);
    const bKey = (b.period?.year ?? 0) * 12 + (b.period?.month ?? 0);
    return bKey - aKey; // newest first
  });

  const periodButtons = (
    <>
      <button
        className={`sidebar-period-btn${selectedId === null ? ' active' : ''}`}
        onClick={() => setSelectedId(null)}
      >
        All Time
      </button>
      {sortedStatements.map((s) => (
        <button
          key={s.id}
          className={`sidebar-period-btn${selectedId === s.id ? ' active' : ''}`}
          onClick={() => setSelectedId(s.id)}
        >
          {s.period?.label ?? s.name}
        </button>
      ))}
    </>
  );

  const dashboardSidebar = savedStatements.length > 0 ? (
    <div>
      <SidebarSection label="Period">{periodButtons}</SidebarSection>
      <SidebarSection label="Monthly Budget">
        <div className="sidebar-budget-wrap">
          <span className="sidebar-budget-sign">$</span>
          <input
            className="sidebar-budget-input"
            type="number"
            min="0"
            step="100"
            placeholder="Set a goal…"
            value={budgetGoal || ''}
            onChange={(e) => setBudgetGoal(parseFloat(e.target.value) || 0)}
          />
        </div>
      </SidebarSection>
    </div>
  ) : null;

  const txSidebar = (
    <div>
      <SidebarSection label="Period">{periodButtons}</SidebarSection>

      <SidebarSection label="Type">
        {[['', 'All'], ['expense', 'Expenses'], ['deposit', 'Deposits'], ['recurring', 'Recurring']].map(([key, label]) => (
          <button
            key={key}
            className={`sidebar-period-btn${txFilters.type === key ? ' active' : ''}`}
            onClick={() => setTxFilter('type', key)}
          >
            {label}
          </button>
        ))}
      </SidebarSection>

      <SidebarSection label="Category">
        <select
          className="sidebar-filter-select"
          value={txFilters.category}
          onChange={(e) => setTxFilter('category', e.target.value)}
        >
          <option value="">All categories</option>
          {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </SidebarSection>

      <SidebarSection label="Amount">
        <div className="sidebar-amount-range">
          <input
            className="sidebar-amount-input"
            type="number" placeholder="Min" min="0"
            value={txFilters.minAmount}
            onChange={(e) => setTxFilter('minAmount', e.target.value)}
          />
          <span className="sidebar-amount-sep">–</span>
          <input
            className="sidebar-amount-input"
            type="number" placeholder="Max" min="0"
            value={txFilters.maxAmount}
            onChange={(e) => setTxFilter('maxAmount', e.target.value)}
          />
        </div>
      </SidebarSection>

      <SidebarSection label="Sort">
        <div className="sidebar-sort-row">
          <select
            className="sidebar-filter-select"
            value={txFilters.sortBy}
            onChange={(e) => setTxFilter('sortBy', e.target.value)}
          >
            {[['date','Date'],['amount','Amount'],['category','Category'],['merchant','Merchant']].map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
          <button
            className="sidebar-sort-dir"
            title={txFilters.sortDir === 'desc' ? 'Descending' : 'Ascending'}
            onClick={() => setTxFilter('sortDir', txFilters.sortDir === 'desc' ? 'asc' : 'desc')}
          >
            {txFilters.sortDir === 'desc' ? '↓' : '↑'}
          </button>
        </div>
      </SidebarSection>

      <SidebarSection label="Options">
        <label className="sidebar-checkbox">
          <input
            type="checkbox"
            checked={txFilters.flaggedOnly}
            onChange={(e) => setTxFilter('flaggedOnly', e.target.checked)}
          />
          <span>🚩 Flagged only</span>
        </label>
        <label className="sidebar-checkbox">
          <input
            type="checkbox"
            checked={txFilters.noRuleOnly}
            onChange={(e) => setTxFilter('noRuleOnly', e.target.checked)}
          />
          <span>Unmatched only</span>
        </label>
      </SidebarSection>
    </div>
  );

  const sidebar =
    page === 'dashboard' ? dashboardSidebar :
    page === 'transactions' ? txSidebar :
    null;

  return (
    <>
      {isLoading && <LoadingSpinner />}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <AppShell
        page={page}
        onPageChange={setPage}
        onUpload={() => setUploadOpen(true)}
        onSync={handleSyncClick}
        syncing={syncState !== 'idle'}
        isConnected={isConnected}
        sidebar={sidebar}
      >
        {page === 'dashboard' && (
          <DashboardPage
            statements={savedStatements}
            selectedId={selectedId}
            budgetGoal={budgetGoal}
          />
        )}

        {page === 'transactions' && (
          <TransactionsPage
            statements={savedStatements}
            selectedId={selectedId}
            allCategories={allCategories}
            onCreateCategory={addCategory}
            onStatementChange={refreshStatements}
            filters={txFilters}
          />
        )}

        {page === 'statements' && (
          <StatementsPage
            statements={sortedStatements}
            onDelete={handleDelete}
            onRename={handleRename}
            onUpload={() => setUploadOpen(true)}
          />
        )}

        {page === 'rules' && <RulesPage />}
      </AppShell>

      {uploadOpen && (
        <UploadModal
          onAnalyze={handleAnalyze}
          onClose={() => setUploadOpen(false)}
        />
      )}

      {reviewData && (
        <ReviewModal
          groups={reviewData.groups}
          duplicateCount={reviewData.duplicateCount}
          allCategories={allCategories}
          onCreateCategory={addCategory}
          onSave={handleSaveNew}
          onClose={() => setReviewData(null)}
        />
      )}
    </>
  );
}

// Collapsible sidebar section
function SidebarSection({ label, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="sidebar-section">
      <button className="sidebar-section-hd" onClick={() => setOpen((v) => !v)}>
        <span className="sidebar-label">{label}</span>
        <span className="sidebar-chevron" aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open && children}
    </div>
  );
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function ymToName(ym) {
  if (!ym || ym === 'no-date') return 'Unknown Month';
  const [y, m] = ym.split('-').map(Number);
  return (y && m) ? `${MONTHS[m - 1]} ${y}` : ym;
}

/**
 * Split a flat transaction array into per-month groups, sorted chronologically.
 * Returns [{ ym, name, transactions }]
 */
function splitByMonth(transactions) {
  const map = new Map();
  for (const t of transactions) {
    const ym = t.date?.slice(0, 7) || 'no-date';
    if (!map.has(ym)) map.set(ym, []);
    map.get(ym).push(t);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, txns]) => ({ ym, name: ymToName(ym), transactions: txns }));
}
