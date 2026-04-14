import { formatCurrency } from '../../utils/formatters.js';
import './HomeView.css';

function formatSavedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function HomeView({ statements, onNew, onSelect, onDelete, onHistory }) {
  return (
    <div className="home-page">
      <div className="home-header">
        <div className="home-logo">$</div>
        <div className="home-title-group">
          <h1>Budget Buddy</h1>
          <p>Your saved statements</p>
        </div>
        <div className="home-actions">
          {statements.length >= 2 && (
            <button className="btn-secondary" onClick={onHistory}>View History</button>
          )}
          <button className="btn-primary" onClick={onNew}>+ New Statement</button>
        </div>
      </div>

      {statements.length === 0 ? (
        <div className="home-empty">
          <div className="empty-icon">📂</div>
          <h2>No statements yet</h2>
          <p>Upload a bank statement to get started</p>
          <button className="btn-primary" onClick={onNew}>Upload Statement</button>
        </div>
      ) : (
        <div className="statements-grid">
          {statements.map((s) => (
            <div
              key={s.id}
              className="statement-card"
              onClick={() => onSelect(s.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(s.id)}
            >
              <div className="card-header">
                <div className="card-period">{s.period?.label || '—'}</div>
                <button
                  className="card-delete"
                  onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                  title="Delete statement"
                  aria-label="Delete"
                >
                  ×
                </button>
              </div>
              <div className="card-name">{s.name}</div>
              <div className="card-saved">Saved {formatSavedAt(s.savedAt)}</div>
              <div className="card-stats">
                <div className="card-stat">
                  <span className="stat-val red">{formatCurrency(s.summary?.totalExpenses ?? 0)}</span>
                  <span className="stat-lbl">expenses</span>
                </div>
                <div className="card-divider" />
                <div className="card-stat">
                  <span className="stat-val">{s.summary?.transactionCount ?? 0}</span>
                  <span className="stat-lbl">transactions</span>
                </div>
                {s.monthlyIncome > 0 && (
                  <>
                    <div className="card-divider" />
                    <div className="card-stat">
                      <span className="stat-val green">{formatCurrency(s.monthlyIncome)}</span>
                      <span className="stat-lbl">income</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
