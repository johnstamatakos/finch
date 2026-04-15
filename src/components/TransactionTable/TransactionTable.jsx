import { useState } from 'react';
import { CATEGORIES } from '../../constants/categories.js';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import SaveModal from '../SaveModal/SaveModal.jsx';
import CategorySelect from '../shared/CategorySelect.jsx';
import './TransactionTable.css';

export default function TransactionTable({
  transactions,
  onUpdate,
  onViewDashboard,
  onBack,
  onSave,           // (name) => void — called to save/update the statement
  statementName,    // string if viewing an existing saved statement
  defaultSaveName,  // suggested name for the save modal
  allCategories,    // full list including user-created categories
  onCreateCategory, // (name) => string — adds a new category, returns name
}) {
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [showSaveModal, setShowSaveModal] = useState(false);

  const expenses = transactions.filter((t) => !t.isDeposit);
  const deposits = transactions.filter((t) => t.isDeposit);
  const totalExpenses = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalDeposits = deposits.reduce((sum, t) => sum + t.amount, 0);

  const filtered = transactions.filter((t) => {
    if (search) {
      const q = search.toLowerCase();
      const inDesc = t.description.toLowerCase().includes(q);
      const inActivity = (t.activity || '').toLowerCase().includes(q);
      if (!inDesc && !inActivity) return false;
    }
    if (filterCategory !== 'All' && t.category !== filterCategory) return false;
    if (filterType === 'Expenses' && t.isDeposit) return false;
    if (filterType === 'Deposits' && !t.isDeposit) return false;
    if (filterType === 'Recurring' && !t.isRecurring) return false;
    return true;
  });

  const handleSaveClick = () => setShowSaveModal(true);
  const handleSaveConfirm = (name) => {
    setShowSaveModal(false);
    onSave(name);
  };

  return (
    <div className="table-page">
      {showSaveModal && (
        <SaveModal
          defaultName={statementName || defaultSaveName || ''}
          onSave={handleSaveConfirm}
          onCancel={() => setShowSaveModal(false)}
        />
      )}

      <div className="table-topbar">
        <div className="topbar-left">
          <button className="btn-ghost" onClick={onBack}>← Back</button>
          {statementName ? (
            <h1>{statementName} <span className="count-badge">{transactions.length}</span></h1>
          ) : (
            <h1>Transactions <span className="count-badge">{transactions.length}</span></h1>
          )}
        </div>
        <div className="topbar-right">
          {onSave && (
            <button className="btn-save" onClick={handleSaveClick}>
              {statementName ? 'Save Changes' : 'Save Statement'}
            </button>
          )}
          <button className="btn-primary" onClick={onViewDashboard}>View Dashboard →</button>
        </div>
      </div>

      <div className="summary-row">
        <div className="summary-card expense">
          <span className="summary-label">Total Expenses</span>
          <span className="summary-amount">{formatCurrency(totalExpenses)}</span>
        </div>
        <div className="summary-card deposit">
          <span className="summary-label">Total Deposits</span>
          <span className="summary-amount">{formatCurrency(totalDeposits)}</span>
        </div>
        <div className="summary-card recurring">
          <span className="summary-label">Recurring Charges</span>
          <span className="summary-amount">
            {transactions.filter((t) => t.isRecurring && !t.isDeposit).length} found
          </span>
        </div>
      </div>

      <div className="filters-row">
        <input
          type="text"
          className="search-input"
          placeholder="Search transactions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="All">All categories</option>
          {(allCategories || CATEGORIES).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          className="filter-select"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="All">All types</option>
          <option value="Expenses">Expenses only</option>
          <option value="Deposits">Deposits only</option>
          <option value="Recurring">Recurring only</option>
        </select>
      </div>

      <div className="table-wrap">
        <table className="tx-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Category</th>
              <th>Recurring</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-row">No transactions match your filters</td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id} className={t.isDeposit ? 'row-deposit' : ''}>
                  <td className="col-date">{formatDate(t.date)}</td>
                  <td className="col-desc">
                    <span className="tx-source">{t.description}</span>
                    {t.activity && <span className="tx-activity">{t.activity}</span>}
                    {t.isDeposit && <span className="deposit-badge">Deposit</span>}
                  </td>
                  <td className={`col-amount ${t.isDeposit ? 'positive' : 'negative'}`}>
                    {t.isDeposit ? '+' : '-'}{formatCurrency(t.amount)}
                  </td>
                  <td className="col-category">
                    {t.isDeposit ? (
                      <span className="deposit-tag">Income/Deposit</span>
                    ) : (
                      <CategorySelect
                        value={t.category}
                        categories={allCategories || CATEGORIES}
                        onChange={(cat) => onUpdate(t.id, { category: cat })}
                        onCreateCategory={onCreateCategory}
                      />
                    )}
                  </td>
                  <td className="col-recurring">
                    {!t.isDeposit && (
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={t.isRecurring}
                          onChange={(e) => onUpdate(t.id, { isRecurring: e.target.checked })}
                        />
                        <span className="toggle-slider" />
                      </label>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
