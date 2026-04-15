import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { CATEGORIES, CATEGORY_COLORS } from '../../constants/categories.js';
import { formatCurrency } from '../../utils/formatters.js';
import InsightsCard from '../../components/InsightsCard/InsightsCard.jsx';
import './DashboardPage.css';

export default function DashboardPage({ statements, selectedId, budgetGoal = 0 }) {
  const selected = selectedId ? statements.find((s) => s.id === selectedId) : null;

  // ── Aggregate (All Time) ──────────────────────────────────────────────────
  const sorted = useMemo(
    () => [...statements].sort((a, b) => {
      const aKey = (a.period?.year ?? 0) * 12 + (a.period?.month ?? 0);
      const bKey = (b.period?.year ?? 0) * 12 + (b.period?.month ?? 0);
      return aKey - bKey;
    }),
    [statements]
  );

  const barData = useMemo(
    () => sorted.map((s) => ({
      label: s.period?.label ?? s.name,
      expenses: s.summary?.totalExpenses ?? 0,
      income: s.summary?.totalDeposits ?? 0,
    })),
    [sorted]
  );

  const { categoryData, totalExpenses, totalIncome } = useMemo(() => {
    const source = selected ? [selected] : statements;
    const totals = {};
    let expenses = 0;
    let income = 0;

    for (const s of source) {
      for (const [cat, amt] of Object.entries(s.summary?.byCategory ?? {})) {
        totals[cat] = (totals[cat] || 0) + amt;
        expenses += amt;
      }
      income += s.summary?.totalDeposits ?? 0;
    }

    const categoryData = CATEGORIES
      .filter((c) => totals[c] > 0)
      .map((c) => ({ name: c, value: parseFloat(totals[c].toFixed(2)) }))
      .sort((a, b) => b.value - a.value);

    return { categoryData, totalExpenses: expenses, totalIncome: income };
  }, [statements, selected]);

  const net = totalIncome - totalExpenses;
  const spendingPct = totalIncome > 0 ? Math.min(100, (totalExpenses / totalIncome) * 100) : 0;

  const hasBudget = budgetGoal > 0;
  const budgetLeft = budgetGoal - totalExpenses;
  const budgetPct = hasBudget ? Math.min(100, (totalExpenses / budgetGoal) * 100) : 0;

  if (statements.length === 0) {
    return (
      <div className="dash-page">
        <div className="dash-empty">
          <div className="dash-empty-icon">📊</div>
          <h2>No data yet</h2>
          <p>Upload a bank statement to see your spending dashboard.</p>
        </div>
      </div>
    );
  }

  // Statements to pass to InsightsCard: selected one or all
  const insightStatements = selected ? [selected] : statements;

  return (
    <div className="dash-page">
      {/* Stat cards */}
      <div className="dash-stats">
        <div className="dash-stat">
          <span className="dash-stat-label">Total Spent</span>
          <span className="dash-stat-val red">{formatCurrency(totalExpenses)}</span>
        </div>
        <div className="dash-stat">
          <span className="dash-stat-label">Income</span>
          <span className="dash-stat-val green">{formatCurrency(totalIncome)}</span>
        </div>
        <div className="dash-stat">
          <span className="dash-stat-label">Net</span>
          <span className={`dash-stat-val ${net >= 0 ? 'green' : 'red'}`}>
            {net >= 0 ? '+' : ''}{formatCurrency(net)}
          </span>
        </div>
        {hasBudget ? (
          <div className="dash-stat">
            <span className="dash-stat-label">Budget Left</span>
            <span className={`dash-stat-val ${budgetLeft >= 0 ? 'green' : 'red'}`}>
              {budgetLeft >= 0 ? '' : '-'}{formatCurrency(Math.abs(budgetLeft))}
            </span>
          </div>
        ) : (
          <div className="dash-stat">
            <span className="dash-stat-label">Statements</span>
            <span className="dash-stat-val purple">{selected ? 1 : statements.length}</span>
          </div>
        )}
      </div>

      {/* Spending bar — budget if set, otherwise vs income */}
      {(hasBudget || totalIncome > 0) && (
        <div className="dash-spend-card">
          <div className="dash-spend-header">
            <span>{hasBudget ? 'Spending vs Budget' : 'Spending vs Income'}</span>
            <span className={(hasBudget ? budgetPct : spendingPct) > 100 ? 'over' : ''}>
              {(hasBudget ? budgetPct : spendingPct).toFixed(0)}%
            </span>
          </div>
          <div className="dash-spend-track">
            <div
              className={`dash-spend-fill ${
                (hasBudget ? budgetPct : spendingPct) > 100 ? 'over' :
                (hasBudget ? budgetPct : spendingPct) > 80 ? 'warn' : ''
              }`}
              style={{ width: `${Math.min(100, hasBudget ? budgetPct : spendingPct)}%` }}
            />
          </div>
          <div className="dash-spend-labels">
            <span>{formatCurrency(totalExpenses)} spent</span>
            <span>{formatCurrency(hasBudget ? budgetGoal : totalIncome)} {hasBudget ? 'budget' : 'income'}</span>
          </div>
        </div>
      )}

      {/* AI Insights */}
      <InsightsCard statements={insightStatements} />

      {/* Monthly trend — only when showing all time */}
      {!selected && statements.length > 1 && (
        <div className="dash-card">
          <h2>Monthly Trend</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3f" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#4b5675' }} axisLine={{ stroke: '#2d3a52' }} tickLine={false} />
              <YAxis
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11, fill: '#4b5675' }}
                width={44}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value, name) => [formatCurrency(value), name === 'expenses' ? 'Expenses' : 'Income']}
                contentStyle={{ borderRadius: '10px', border: '1px solid #2d3a52', fontSize: 12, background: '#1c2338', color: '#f1f5f9' }}
                cursor={{ fill: 'rgba(129,140,248,0.06)' }}
              />
              <Bar dataKey="income" fill="#0d9488" radius={[4, 4, 0, 0]} name="income" />
              <Bar dataKey="expenses" fill="#818cf8" radius={[4, 4, 0, 0]} name="expenses" />
            </BarChart>
          </ResponsiveContainer>
          <div className="dash-legend">
            <span><span className="dash-legend-dot" style={{ background: '#818cf8' }} /> Expenses</span>
            <span><span className="dash-legend-dot" style={{ background: '#0d9488' }} /> Income</span>
          </div>
        </div>
      )}

      {/* Category columns */}
      <div className="dash-columns">
        <div className="dash-card">
          <h2>Spending by Category</h2>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%" cy="50%"
                  innerRadius={65} outerRadius={100}
                  paddingAngle={3} dataKey="value"
                >
                  {categoryData.map((entry) => (
                    <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => [formatCurrency(v), 'Amount']}
                  contentStyle={{ borderRadius: '10px', border: '1px solid #2d3a52', fontSize: 12, background: '#1c2338', color: '#f1f5f9' }}
                />
                <Legend iconType="circle" iconSize={9} formatter={(v) => <span style={{ fontSize: 12, color: '#8898aa' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="dash-empty-chart">No expense data</p>
          )}
        </div>

        <div className="dash-card">
          <h2>Category Breakdown</h2>
          <div className="dash-breakdown">
            {categoryData.map((item) => (
              <div key={item.name} className="dash-breakdown-row">
                <div className="dash-breakdown-dot" style={{ background: CATEGORY_COLORS[item.name] }} />
                <span className="dash-breakdown-name">{item.name}</span>
                <div className="dash-breakdown-bar-wrap">
                  <div
                    className="dash-breakdown-bar"
                    style={{ width: `${(item.value / totalExpenses) * 100}%`, background: CATEGORY_COLORS[item.name] }}
                  />
                </div>
                <span className="dash-breakdown-amt">{formatCurrency(item.value)}</span>
                <span className="dash-breakdown-pct">{((item.value / totalExpenses) * 100).toFixed(0)}%</span>
              </div>
            ))}
            {categoryData.length === 0 && <p className="dash-empty-chart">No data</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
