import { useState, useEffect } from 'react';
import HomeView from './components/HomeView/HomeView.jsx';
import UploadView from './components/UploadView/UploadView.jsx';
import TransactionTable from './components/TransactionTable/TransactionTable.jsx';
import Dashboard from './components/Dashboard/Dashboard.jsx';
import HistoryView from './components/HistoryView/HistoryView.jsx';
import LoadingSpinner from './components/shared/LoadingSpinner.jsx';
import ErrorBanner from './components/shared/ErrorBanner.jsx';
import './App.css';

export default function App() {
  // 'loading' | 'home' | 'upload' | 'review' | 'dashboard' | 'history'
  const [view, setView] = useState('loading');
  const [savedStatements, setSavedStatements] = useState([]); // metadata list
  const [transactions, setTransactions] = useState([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [currentStatementId, setCurrentStatementId] = useState(null); // null = fresh
  const [currentStatementName, setCurrentStatementName] = useState('');
  const [defaultSaveName, setDefaultSaveName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load statements list on mount
  useEffect(() => {
    fetch('/api/statements')
      .then((r) => r.json())
      .then((data) => {
        setSavedStatements(Array.isArray(data) ? data : []);
        setView(Array.isArray(data) && data.length > 0 ? 'home' : 'upload');
      })
      .catch(() => setView('upload'));
  }, []);

  const refreshStatements = () =>
    fetch('/api/statements')
      .then((r) => r.json())
      .then((data) => setSavedStatements(Array.isArray(data) ? data : []))
      .catch(() => {});

  // ── Analyze a new file ────────────────────────────────────────────────────
  const handleAnalyze = async (file, income) => {
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('monthlyIncome', income);

      const res = await fetch('/api/analyze', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed. Please try again.');

      setTransactions(data.transactions);
      setMonthlyIncome(data.monthlyIncome);
      setCurrentStatementId(null);
      setCurrentStatementName('');
      // Suggest a name based on the detected period — we'll compute it client-side from dates
      setDefaultSaveName(suggestName(data.transactions));
      setView('review');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Save a new statement ──────────────────────────────────────────────────
  const handleSaveStatement = async (name) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, monthlyIncome, transactions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed.');

      setCurrentStatementId(data.id);
      setCurrentStatementName(name);
      await refreshStatements();
      setView('home');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Update an existing statement (re-categorized) ────────────────────────
  const handleUpdateStatement = async (name) => {
    if (!currentStatementId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/statements/${currentStatementId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, monthlyIncome, transactions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed.');

      setCurrentStatementName(name);
      await refreshStatements();
      setView('home');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Load a saved statement for viewing/editing ───────────────────────────
  const handleSelectStatement = async (id) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/statements/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load statement.');

      setTransactions(data.transactions);
      setMonthlyIncome(data.monthlyIncome);
      setCurrentStatementId(data.id);
      setCurrentStatementName(data.name);
      setDefaultSaveName(data.name);
      setView('review');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Delete a statement ───────────────────────────────────────────────────
  const handleDeleteStatement = async (id) => {
    if (!window.confirm('Delete this statement? This cannot be undone.')) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/statements/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed.');
      }
      await refreshStatements();
      setSavedStatements((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (next.length === 0) setView('upload');
        return next;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Local edits (category / recurring) ───────────────────────────────────
  const updateTransaction = (id, updates) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  };

  const handleSave = currentStatementId ? handleUpdateStatement : handleSaveStatement;

  if (view === 'loading') return null;

  return (
    <>
      {isLoading && <LoadingSpinner />}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {view === 'home' && (
        <HomeView
          statements={savedStatements}
          onNew={() => setView('upload')}
          onSelect={handleSelectStatement}
          onDelete={handleDeleteStatement}
          onHistory={() => setView('history')}
        />
      )}

      {view === 'upload' && (
        <UploadView
          onAnalyze={handleAnalyze}
          showBack={savedStatements.length > 0}
          onBack={() => setView('home')}
        />
      )}

      {view === 'review' && (
        <TransactionTable
          transactions={transactions}
          onUpdate={updateTransaction}
          onViewDashboard={() => setView('dashboard')}
          onBack={() => setView(savedStatements.length > 0 ? 'home' : 'upload')}
          onSave={handleSave}
          statementName={currentStatementName}
          defaultSaveName={defaultSaveName}
        />
      )}

      {view === 'dashboard' && (
        <Dashboard
          transactions={transactions}
          monthlyIncome={monthlyIncome}
          onBack={() => setView('review')}
        />
      )}

      {view === 'history' && (
        <HistoryView
          statements={savedStatements}
          onBack={() => setView('home')}
        />
      )}
    </>
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
