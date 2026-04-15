import { useState, useEffect } from 'react';
import './RulesPage.css';

export default function RulesPage() {
  const [rules, setRules] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = () =>
    fetch('/api/rules')
      .then((r) => r.json())
      .then((data) => setRules(data || {}))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const handleDelete = async (key) => {
    await fetch(`/api/rules/${encodeURIComponent(key)}`, { method: 'DELETE' });
    setRules((prev) => { const next = { ...prev }; delete next[key]; return next; });
  };

  const entries = Object.entries(rules)
    .filter(([merchant, category]) =>
      !search.trim() ||
      merchant.toLowerCase().includes(search.toLowerCase()) ||
      category.toLowerCase().includes(search.toLowerCase())
    )
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="rules-page">
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
      </div>

      {loading ? (
        <div className="rules-loading">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="rules-empty">
          {Object.keys(rules).length === 0
            ? 'No rules yet. Rules are created when you correct a category.'
            : 'No rules match your search.'}
        </div>
      ) : (
        <div className="rules-table-wrap">
          <table className="rules-table">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Category</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([merchant, category]) => (
                <tr key={merchant}>
                  <td className="rules-merchant">{merchant}</td>
                  <td className="rules-category">{category}</td>
                  <td className="rules-actions">
                    <button
                      className="rules-delete-btn"
                      onClick={() => handleDelete(merchant)}
                      title="Delete rule"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
