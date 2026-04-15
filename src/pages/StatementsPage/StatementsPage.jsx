import { useState } from 'react';
import { formatCurrency } from '../../utils/formatters.js';
import './StatementsPage.css';

function formatSavedDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function StatementsPage({ statements, onDelete, onRename, onUpload }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const startRename = (s) => {
    setEditingId(s.id);
    setEditName(s.name);
  };

  const saveRename = async () => {
    if (editName.trim()) await onRename(editingId, editName.trim());
    setEditingId(null);
  };

  const cancelRename = () => setEditingId(null);

  const confirmDelete = (id) => setConfirmDeleteId(id);

  const doDelete = async () => {
    if (confirmDeleteId) await onDelete(confirmDeleteId);
    setConfirmDeleteId(null);
  };

  if (statements.length === 0) {
    return (
      <div className="stmts-page">
        <div className="stmts-empty">
          <div className="stmts-empty-icon">📂</div>
          <h2>No data yet</h2>
          <p>Upload your first bank statement to get started.</p>
          <button className="stmts-upload-btn" onClick={onUpload}>Upload Statement</button>
        </div>
      </div>
    );
  }

  const confirmStmt = statements.find((s) => s.id === confirmDeleteId);

  return (
    <div className="stmts-page">
      <div className="stmts-header">
        <div className="stmts-header-left">
          <h1>Imported Data</h1>
          <span className="stmts-count">{statements.length} statement{statements.length !== 1 ? 's' : ''}</span>
        </div>
        <button className="stmts-upload-btn" onClick={onUpload}>+ Upload More</button>
      </div>

      <div className="stmts-table-wrap">
        <table className="stmts-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Name</th>
              <th className="stmts-col-num">Expenses</th>
              <th className="stmts-col-num">Deposits</th>
              <th className="stmts-col-num">Transactions</th>
              <th>Imported</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {statements.map((s) => (
              <tr key={s.id}>
                <td className="stmts-period">{s.period?.label ?? '—'}</td>
                <td className="stmts-name-cell">
                  {editingId === s.id ? (
                    <div className="stmts-rename-row">
                      <input
                        className="stmts-rename-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') cancelRename(); }}
                        autoFocus
                        maxLength={80}
                      />
                      <button className="stmts-rename-save" onClick={saveRename}>Save</button>
                      <button className="stmts-rename-cancel" onClick={cancelRename}>×</button>
                    </div>
                  ) : (
                    <span
                      className="stmts-name"
                      onClick={() => startRename(s)}
                      title="Click to rename"
                    >
                      {s.name}
                      <span className="stmts-edit-hint">✎</span>
                    </span>
                  )}
                </td>
                <td className="stmts-col-num stmts-expenses">
                  {formatCurrency(s.summary?.totalExpenses ?? 0)}
                </td>
                <td className="stmts-col-num stmts-deposits">
                  {s.summary?.totalDeposits > 0 ? formatCurrency(s.summary.totalDeposits) : '—'}
                </td>
                <td className="stmts-col-num stmts-txcount">
                  {s.summary?.transactionCount ?? 0}
                </td>
                <td className="stmts-saved">{formatSavedDate(s.savedAt)}</td>
                <td className="stmts-actions">
                  <button
                    className="stmts-delete-btn"
                    onClick={() => confirmDelete(s.id)}
                    title="Delete this statement"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="stmts-confirm-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="stmts-confirm" onClick={(e) => e.stopPropagation()}>
            <p className="stmts-confirm-msg">
              Delete <strong>{confirmStmt?.name ?? 'this statement'}</strong>?
              <br />
              <span className="stmts-confirm-sub">This removes all its transactions and cannot be undone.</span>
            </p>
            <div className="stmts-confirm-actions">
              <button className="stmts-confirm-cancel" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button className="stmts-confirm-delete" onClick={doDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
