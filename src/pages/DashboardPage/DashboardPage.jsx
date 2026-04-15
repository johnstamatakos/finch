import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { CATEGORIES, CATEGORY_COLORS } from '../../constants/categories.js';
import { formatCurrency } from '../../utils/formatters.js';
import InsightsCard from '../../components/InsightsCard/InsightsCard.jsx';
import './DashboardPage.css';

// Match stat card colors
const COLOR_EXPENSES = '#f87171'; // var(--negative)
const COLOR_INCOME   = '#34d399'; // var(--positive)

const TOOLTIP_STYLE = {
  borderRadius: '10px',
  border: '1px solid #2d3a52',
  fontSize: 12,
  background: '#1c2338',
  color: '#f1f5f9',
};

const AXIS_TICK  = { fontSize: 11, fill: '#4b5675' };
const AXIS_LINE  = { stroke: '#2d3a52' };
const GRID_STYLE = { strokeDasharray: '3 3', stroke: '#1e2a3f' };

export default function DashboardPage({ statements, selectedId, budgetGoal = 0 }) {
  const selected = selectedId ? statements.find((s) => s.id === selectedId) : null;

  // ── Sorted for trend charts ───────────────────────────────────────────────
  const sorted = useMemo(
    () => [...statements].sort((a, b) => {
      const aKey = (a.period?.year ?? 0) * 12 + (a.period?.month ?? 0);
      const bKey = (b.period?.year ?? 0) * 12 + (b.period?.month ?? 0);
      return aKey - bKey;
    }),
    [statements]
  );

  // ── Monthly trend bar data ────────────────────────────────────────────────
  const barData = useMemo(
    () => sorted.map((s) => ({
      label: s.period?.label ?? s.name,
      expenses: s.summary?.totalExpenses ?? 0,
      income: s.summary?.totalDeposits ?? 0,
    })),
    [sorted]
  );

  // ── Category trend line data (top 6 categories by total spend) ────────────
  const { catTrendData, trendCategories } = useMemo(() => {
    if (sorted.length < 2) return { catTrendData: [], trendCategories: [] };

    // Collect all categories and their totals across all months
    const totals = {};
    for (const s of sorted) {
      for (const [cat, amt] of Object.entries(s.summary?.byCategory ?? {})) {
        totals[cat] = (totals[cat] || 0) + amt;
      }
    }

    // Top 6 by total spend
    const trendCategories = Object.keys(totals)
      .sort((a, b) => totals[b] - totals[a])
      .slice(0, 6);

    const catTrendData = sorted.map((s) => {
      const point = { label: s.period?.label ?? s.name };
      for (const cat of trendCategories) {
        point[cat] = parseFloat((s.summary?.byCategory?.[cat] ?? 0).toFixed(2));
      }
      return point;
    });

    return { catTrendData, trendCategories };
  }, [sorted]);

  // ── Category totals for pie / breakdown ───────────────────────────────────
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
  const hasBudget = budgetGoal > 0;
  const budgetLeft = budgetGoal - totalExpenses;

  const showTrends = !selected && sorted.length > 1;

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

  const insightStatements = selected ? [selected] : statements;

  return (
    <div className="dash-page">

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
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

      {/* ── AI Insights ─────────────────────────────────────────────────── */}
      <InsightsCard statements={insightStatements} />

      {/* ── Monthly trend + Category trend (side by side, all-time only) ── */}
      {showTrends && (
        <div className="dash-columns">

          {/* Bar chart: expenses vs income per month */}
          <div className="dash-card">
            <h2>Monthly Trend</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={AXIS_TICK}
                  width={44}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value, name) => [formatCurrency(value), name === 'expenses' ? 'Expenses' : 'Income']}
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: 'rgba(129,140,248,0.06)' }}
                />
                <Bar dataKey="income"   fill={COLOR_INCOME}   radius={[4, 4, 0, 0]} name="income" />
                <Bar dataKey="expenses" fill={COLOR_EXPENSES} radius={[4, 4, 0, 0]} name="expenses" />
              </BarChart>
            </ResponsiveContainer>
            <div className="dash-legend">
              <span><span className="dash-legend-dot" style={{ background: COLOR_EXPENSES }} /> Expenses</span>
              <span><span className="dash-legend-dot" style={{ background: COLOR_INCOME }} /> Income</span>
            </div>
          </div>

          {/* Line chart: category spending per month */}
          <div className="dash-card">
            <h2>Category Trends</h2>
            {catTrendData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={catTrendData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid {...GRID_STYLE} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                    <YAxis
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      tick={AXIS_TICK}
                      width={44}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v, name) => [formatCurrency(v), name]}
                      contentStyle={TOOLTIP_STYLE}
                    />
                    {trendCategories.map((cat) => (
                      <Line
                        key={cat}
                        type="monotone"
                        dataKey={cat}
                        stroke={CATEGORY_COLORS[cat] || '#94a3b8'}
                        strokeWidth={2}
                        dot={{ r: 3, fill: CATEGORY_COLORS[cat] || '#94a3b8', strokeWidth: 0 }}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                <div className="dash-legend dash-legend-wrap">
                  {trendCategories.map((cat) => (
                    <span key={cat}>
                      <span className="dash-legend-dot" style={{ background: CATEGORY_COLORS[cat] }} />
                      {cat}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="dash-empty-chart">No category data yet</p>
            )}
          </div>
        </div>
      )}

      {/* ── Category pie + breakdown ─────────────────────────────────────── */}
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
                  formatter={(v, name) => [formatCurrency(v), name]}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Legend
                  iconType="circle"
                  iconSize={9}
                  formatter={(v) => <span style={{ fontSize: 12, color: '#8898aa' }}>{v}</span>}
                />
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
