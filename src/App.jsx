import { useState, useEffect } from 'react';
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
  const [reviewData, setReviewData] = useState(null); // { transactions, defaultName }

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

  // ── Load statements on mount ─────────────────────────────────────────────
  useEffect(() => {
    refreshStatements();
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

      setReviewData({
        transactions: data.transactions,
        defaultName: suggestName(data.transactions),
      });
    } catch (err) {
      setError(err.message);
      setUploadOpen(true); // reopen so they can retry
    } finally {
      setIsLoading(false);
    }
  };

  // ── Save new statement from drawer ────────────────────────────────────────
  const handleSaveNew = async (name, transactions) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, monthlyIncome: 0, transactions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed.');

      setReviewData(null);
      await refreshStatements();
      setPage('dashboard');
      if (data.duplicateCount > 0) {
        setError(`Saved. ${data.duplicateCount} duplicate transaction${data.duplicateCount === 1 ? '' : 's'} already in another statement were skipped.`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
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
          />
        )}

        {page === 'statements' && (
          <StatementsPage
            statements={sortedStatements}
            onSelect={(id) => { setSelectedId(id); setPage('transactions'); }}
            onDelete={handleDelete}
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
          initialTransactions={reviewData.transactions}
          defaultName={reviewData.defaultName}
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

// Suggest a statement name from transaction dates
function suggestName(transactions) {
  const MONTHS = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  const counts = {};
  for (const t of transactions) {
    if (t.date && /^\d{4}-\d{2}/.test(t.date)) {
      const ym = t.date.slice(0, 7);
      counts[ym] = (counts[ym] || 0) + 1;
    }
  }
  const keys = Object.keys(counts);
  if (keys.length === 0) return '';
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const best = keys.sort((a, b) => counts[b] - counts[a])[0];
  if (counts[best] / total >= 0.4) {
    const [y, m] = best.split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }
  const earliest = keys.sort()[0];
  const [y, m] = earliest.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
