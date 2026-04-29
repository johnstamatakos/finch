import { useState, useCallback } from 'react';
import AppShell from './components/AppShell/AppShell.jsx';
import UploadModal from './components/UploadModal/UploadModal.jsx';
import ReviewModal from './components/ReviewModal/ReviewModal.jsx';
import DashboardPage from './pages/DashboardPage/DashboardPage.jsx';
import TransactionsPage from './pages/TransactionsPage/TransactionsPage.jsx';
import StatementsPage from './pages/StatementsPage/StatementsPage.jsx';
import RulesPage from './pages/RulesPage/RulesPage.jsx';
import CategoriesPage from './pages/CategoriesPage/CategoriesPage.jsx';
import LoadingSpinner from './components/shared/LoadingSpinner.jsx';
import ErrorBanner from './components/shared/ErrorBanner.jsx';
import SidebarSection from './components/shared/SidebarSection.jsx';
import { useCategories } from './hooks/useCategories.js';
import { useStatements } from './hooks/useStatements.js';
import { usePlaidSync } from './hooks/usePlaidSync.js';
import { useBudgetGoal } from './hooks/useBudgetGoal.js';
import { groupByMonth } from './utils/formatters.js';
import './App.css';

export default function App() {
  const { allCategories, addCategory, renameCategory, removeCategory } = useCategories();

  // ── Navigation ───────────────────────────────────────────────────────────
  const [page, setPage] = useState('dashboard');
  const [selectedId, setSelectedId] = useState(null); // null = All Time

  // ── Global error (upload/analyze errors) ─────────────────────────────────
  const [error, setError] = useState(null);

  // ── Upload + Review flow ─────────────────────────────────────────────────
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reviewData, setReviewData] = useState(null); // { groups, duplicateCount, cursor? }

  // ── Transaction filters ───────────────────────────────────────────────────
  const [txFilters, setTxFilters] = useState({
    type: '', category: '', minAmount: '', maxAmount: '',
    noRuleOnly: false, flaggedOnly: false, sortBy: 'date', sortDir: 'desc',
  });
  const setTxFilter = (key, value) => setTxFilters((f) => ({ ...f, [key]: value }));

  // ── Hooks ────────────────────────────────────────────────────────────────
  const [budgetGoal, setBudgetGoal] = useBudgetGoal();

  const {
    savedStatements, sortedStatements, refresh: refreshStatements,
    renameStatement, deleteStatement, saveGroups,
    isLoading: stmtLoading, error: stmtError, clearError: clearStmtError,
  } = useStatements();

  const { isConnected, syncState, handleSyncClick } = usePlaidSync({
    onReviewData: setReviewData,
    onError: setError,
  });

  // Merge errors from statements hook into single banner
  const displayError = error || stmtError;
  const dismissError = () => { setError(null); clearStmtError(); };

  // ── Analyze uploaded file ─────────────────────────────────────────────────
  const handleAnalyze = useCallback(async (file) => {
    setError(null);
    setUploadOpen(false);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/analyze', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed. Please try again.');
      setReviewData({ groups: groupByMonth(data.transactions), duplicateCount: data.duplicateCount || 0 });
    } catch (err) {
      setError(err.message);
      setUploadOpen(true);
    }
  }, []);

  // ── Save statement(s) from review modal ───────────────────────────────────
  const handleSaveNew = useCallback(async (groups) => {
    await saveGroups(groups, reviewData?.cursor);
    setReviewData(null);
    setPage('dashboard');
  }, [saveGroups, reviewData]);

  // ── Delete statement ──────────────────────────────────────────────────────
  const handleDelete = useCallback((id) => {
    deleteStatement(id, (deletedId) => {
      if (selectedId === deletedId) setSelectedId(null);
    });
  }, [deleteStatement, selectedId]);

  // ── Sidebar ───────────────────────────────────────────────────────────────
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
    page === 'dashboard'    ? dashboardSidebar :
    page === 'transactions' ? txSidebar :
    null;

  return (
    <>
      {stmtLoading && <LoadingSpinner />}
      {displayError && <ErrorBanner message={displayError} onDismiss={dismissError} />}

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
            onRename={renameStatement}
            onUpload={() => setUploadOpen(true)}
          />
        )}

        {page === 'categories' && (
          <CategoriesPage
            allCategories={allCategories}
            onAddCategory={addCategory}
            onRenameCategory={renameCategory}
            onRemoveCategory={removeCategory}
            onStatementChange={refreshStatements}
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
