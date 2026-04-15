import { formatCurrency } from '../../utils/formatters.js';
import './StatementsPage.css';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function StatementsPage({ statements, onSelect, onDelete, onUpload }) {
  if (statements.length === 0) {
    return (
      <div className="stmts-page">
        <div className="stmts-empty">
          <div className="stmts-empty-icon">📂</div>
          <h2>No statements yet</h2>
          <p>Upload your first bank statement to get started.</p>
          <button className="stmts-upload-btn" onClick={onUpload}>Upload Statement</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stmts-page">
      <div className="stmts-header">
        <h1>Statements</h1>
        <span className="stmts-count">{statements.length} saved</span>
      </div>

      <div className="stmts-grid">
        {statements.map((s) => (
          <div
            key={s.id}
            className="stmt-card"
            onClick={() => onSelect(s.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(s.id)}
          >
            <div className="stmt-card-top">
              <div className="stmt-period">{s.period?.label ?? '—'}</div>
              <button
                className="stmt-delete"
                onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                title="Delete"
                aria-label="Delete statement"
              >
                ×
              </button>
            </div>
            <div className="stmt-name">{s.name}</div>
            <div className="stmt-date">Saved {formatDate(s.savedAt)}</div>
            <div className="stmt-metrics">
              <div className="stmt-metric">
                <span className="stmt-metric-val red">{formatCurrency(s.summary?.totalExpenses ?? 0)}</span>
                <span className="stmt-metric-lbl">expenses</span>
              </div>
              <div className="stmt-divider" />
              <div className="stmt-metric">
                <span className="stmt-metric-val">{s.summary?.transactionCount ?? 0}</span>
                <span className="stmt-metric-lbl">transactions</span>
              </div>
              {s.monthlyIncome > 0 && (
                <>
                  <div className="stmt-divider" />
                  <div className="stmt-metric">
                    <span className="stmt-metric-val green">{formatCurrency(s.monthlyIncome)}</span>
                    <span className="stmt-metric-lbl">income</span>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
