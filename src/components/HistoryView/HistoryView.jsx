import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { CATEGORIES, CATEGORY_COLORS } from '../../constants/categories.js';
import { formatCurrency } from '../../utils/formatters.js';
import './HistoryView.css';

export default function HistoryView({ statements, onBack }) {
  // Sort statements chronologically
  const sorted = useMemo(
    () => [...statements].sort((a, b) => {
      const aKey = (a.period?.year ?? 0) * 12 + (a.period?.month ?? 0);
      const bKey = (b.period?.year ?? 0) * 12 + (b.period?.month ?? 0);
      return aKey - bKey;
    }),
    [statements]
  );

  // Monthly spending bar chart data
  const barData = useMemo(
    () => sorted.map((s) => ({
      label: s.period?.label ?? s.name,
      expenses: s.summary?.totalExpenses ?? 0,
      income: s.monthlyIncome > 0 ? s.monthlyIncome : (s.summary?.totalDeposits ?? 0),
    })),
    [sorted]
  );

  // All-time category totals
  const categoryTotals = useMemo(() => {
    const totals = {};
    for (const s of statements) {
      for (const [cat, amt] of Object.entries(s.summary?.byCategory ?? {})) {
        totals[cat] = (totals[cat] || 0) + amt;
      }
    }
    return CATEGORIES
      .filter((c) => totals[c] > 0)
      .map((c) => ({ name: c, value: parseFloat(totals[c].toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }, [statements]);

  const allTimeExpenses = categoryTotals.reduce((s, c) => s + c.value, 0);
  const allTimeIncome = statements.reduce((s, st) => {
    const inc = st.monthlyIncome > 0 ? st.monthlyIncome : (st.summary?.totalDeposits ?? 0);
    return s + inc;
  }, 0);

  return (
    <div className="history-page">
      <div className="history-topbar">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <h1>Spending History</h1>
        <div />
      </div>

      <div className="history-content">
        {/* Top summary */}
        <div className="history-stats">
          <div className="hstat-card">
            <span className="hstat-label">Statements</span>
            <span className="hstat-value">{statements.length}</span>
          </div>
          <div className="hstat-card">
            <span className="hstat-label">All-Time Expenses</span>
            <span className="hstat-value red">{formatCurrency(allTimeExpenses)}</span>
          </div>
          <div className="hstat-card">
            <span className="hstat-label">All-Time Income</span>
            <span className="hstat-value green">{formatCurrency(allTimeIncome)}</span>
          </div>
          <div className="hstat-card">
            <span className="hstat-label">Net</span>
            <span className={`hstat-value ${allTimeIncome - allTimeExpenses >= 0 ? 'green' : 'red'}`}>
              {allTimeIncome - allTimeExpenses >= 0 ? '+' : ''}
              {formatCurrency(allTimeIncome - allTimeExpenses)}
            </span>
          </div>
        </div>

        {/* Monthly trend bar chart */}
        <div className="history-card">
          <h2>Monthly Spending Trend</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} />
              <YAxis
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 12, fill: '#6b7280' }}
                width={48}
              />
              <Tooltip
                formatter={(value, name) => [
                  formatCurrency(value),
                  name === 'expenses' ? 'Expenses' : 'Income',
                ]}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 13 }}
              />
              <Bar dataKey="income" fill="#bbf7d0" radius={[4, 4, 0, 0]} name="income" />
              <Bar dataKey="expenses" fill="#6366f1" radius={[4, 4, 0, 0]} name="expenses" />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            <span className="legend-dot" style={{ background: '#6366f1' }} /> Expenses
            <span className="legend-dot" style={{ background: '#bbf7d0', border: '1px solid #86efac' }} /> Income
          </div>
        </div>

        <div className="history-columns">
          {/* Pie chart */}
          <div className="history-card">
            <h2>All-Time by Category</h2>
            {categoryTotals.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={categoryTotals}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryTotals.map((entry) => (
                      <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [formatCurrency(v), 'Total']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 13 }}
                  />
                  <Legend iconType="circle" iconSize={9} formatter={(v) => <span style={{ fontSize: 12 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="empty-chart">No data</p>
            )}
          </div>

          {/* Category breakdown */}
          <div className="history-card">
            <h2>Category Totals</h2>
            <div className="cat-list">
              {categoryTotals.map((item) => (
                <div key={item.name} className="cat-row">
                  <div className="cat-dot" style={{ background: CATEGORY_COLORS[item.name] }} />
                  <span className="cat-name">{item.name}</span>
                  <div className="cat-bar-wrap">
                    <div
                      className="cat-bar"
                      style={{
                        width: `${(item.value / allTimeExpenses) * 100}%`,
                        background: CATEGORY_COLORS[item.name],
                      }}
                    />
                  </div>
                  <span className="cat-amount">{formatCurrency(item.value)}</span>
                  <span className="cat-pct">{((item.value / allTimeExpenses) * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Statement list */}
        <div className="history-card">
          <h2>All Statements</h2>
          <table className="stmts-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Period</th>
                <th>Expenses</th>
                <th>Income</th>
                <th>Transactions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.id}>
                  <td className="stmt-name">{s.name}</td>
                  <td>{s.period?.label ?? '—'}</td>
                  <td className="red">{formatCurrency(s.summary?.totalExpenses ?? 0)}</td>
                  <td className="green">
                    {s.monthlyIncome > 0
                      ? formatCurrency(s.monthlyIncome)
                      : formatCurrency(s.summary?.totalDeposits ?? 0)}
                  </td>
                  <td>{s.summary?.transactionCount ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
