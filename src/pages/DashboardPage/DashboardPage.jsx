import { useMemo, useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  LineChart, Line,
  AreaChart, Area,
  ResponsiveContainer, PieChart, Pie, Cell,
  Treemap,
} from 'recharts';
import { useCategories } from '../../hooks/useCategories.js';
import { formatCurrency } from '../../utils/formatters.js';
import { CHART_COLORS, TOOLTIP_STYLE, AXIS_TICK, AXIS_LINE, GRID_STYLE } from '../../constants/chartTheme.js';
import InsightsCard from '../../components/InsightsCard/InsightsCard.jsx';
import './DashboardPage.css';

const COLOR_EXPENSES  = CHART_COLORS.expenses;
const COLOR_INCOME    = CHART_COLORS.income;
const COLOR_ACCENT    = CHART_COLORS.accent;
const COLOR_MERCHANTS = CHART_COLORS.merchants;
const COLOR_RECURRING = CHART_COLORS.recurring;
const COLOR_ONETIME   = CHART_COLORS.onetime;
const COLOR_DAILY     = CHART_COLORS.daily;


export default function DashboardPage({ statements, selectedId, budgetGoal = 0 }) {
  const { getCategoryColor } = useCategories();
  const selected = selectedId ? statements.find((s) => s.id === selectedId) : null;

  // ── Fetch full transaction data for merchant/recurring/daily charts ────────
  const [txns, setTxns] = useState([]);
  useEffect(() => {
    if (statements.length === 0) { setTxns([]); return; }
    const ids = selectedId ? [selectedId] : statements.map((s) => s.id);
    Promise.all(
      ids.map((id) =>
        fetch(`/api/statements/${id}`)
          .then((r) => r.json())
          .then((d) => d.transactions || [])
          .catch(() => [])
      )
    ).then((arrays) => setTxns(arrays.flat()));
  }, [statements, selectedId]);

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

    const totals = {};
    for (const s of sorted) {
      for (const [cat, amt] of Object.entries(s.summary?.byCategory ?? {})) {
        totals[cat] = (totals[cat] || 0) + amt;
      }
    }

    const trendCategories = Object.keys(totals)
      .filter((c) => c !== 'Transfers')
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

    const categoryData = Object.entries(totals)
      .filter(([c, v]) => c !== 'Transfers' && v > 0)
      .map(([c, v]) => ({ name: c, value: parseFloat(v.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);

    return { categoryData, totalExpenses: expenses, totalIncome: income };
  }, [statements, selected]);

  // ── Top merchants ─────────────────────────────────────────────────────────
  const merchantData = useMemo(() => {
    const totals = {};
    const cats = {};
    for (const t of txns) {
      if (t.isDeposit || t.category === 'Transfers') continue;
      totals[t.description] = (totals[t.description] || 0) + Math.abs(t.amount);
      // Track most-common category per merchant for tile coloring
      cats[t.description] = cats[t.description] || {};
      cats[t.description][t.category] = (cats[t.description][t.category] || 0) + 1;
    }
    return Object.entries(totals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
      .map(([name, value]) => {
        const catCounts = cats[name] || {};
        const category = Object.entries(catCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || 'Other';
        return { name, value: parseFloat(value.toFixed(2)), category };
      });
  }, [txns]);

  // ── Recurring vs one-time ─────────────────────────────────────────────────
  const recurringData = useMemo(() => {
    let recurring = 0, oneTime = 0;
    for (const t of txns) {
      if (t.isDeposit || t.category === 'Transfers') continue;
      if (t.isRecurring) recurring += Math.abs(t.amount);
      else oneTime += Math.abs(t.amount);
    }
    return [
      { name: 'Recurring', value: parseFloat(recurring.toFixed(2)) },
      { name: 'One-time',  value: parseFloat(oneTime.toFixed(2)) },
    ].filter((d) => d.value > 0);
  }, [txns]);

  const recurringTotal = recurringData.find((d) => d.name === 'Recurring')?.value ?? 0;
  const recurringPct = recurringData.length > 0
    ? Math.round(recurringTotal / recurringData.reduce((s, d) => s + d.value, 0) * 100)
    : 0;

  // ── Daily spend pattern ───────────────────────────────────────────────────
  const dailyData = useMemo(() => {
    const byDay = {};
    for (const t of txns) {
      if (t.isDeposit || t.category === 'Transfers') continue;
      const day = parseInt(t.date?.slice(8, 10), 10);
      if (!isNaN(day)) byDay[day] = (byDay[day] || 0) + Math.abs(t.amount);
    }
    return Array.from({ length: 31 }, (_, i) => ({
      day: i + 1,
      amount: parseFloat((byDay[i + 1] || 0).toFixed(2)),
    }));
  }, [txns]);

  // ── Savings rate trend ────────────────────────────────────────────────────
  const savingsRateData = useMemo(() =>
    sorted.map((s) => ({
      label: s.period?.label ?? s.name,
      rate: s.summary?.totalDeposits > 0
        ? parseFloat(
            ((s.summary.totalDeposits - s.summary.totalExpenses) / s.summary.totalDeposits * 100).toFixed(1)
          )
        : 0,
    })),
  [sorted]);

  const net = totalIncome - totalExpenses;
  const hasBudget = budgetGoal > 0;
  const showTrends = !selected && sorted.length > 1;

  const [hiddenCats, setHiddenCats] = useState(new Set());
  const toggleCat = (cat) =>
    setHiddenCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

  const [hiddenPieCats, setHiddenPieCats] = useState(new Set());
  const togglePieCat = (cat) =>
    setHiddenPieCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  const visiblePieData = categoryData.filter((d) => !hiddenPieCats.has(d.name));

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
        <div className="dash-stat">
          <span className="dash-stat-label">Statements</span>
          <span className="dash-stat-val purple">{selected ? 1 : statements.length}</span>
        </div>
      </div>

      {/* ── AI Insights ─────────────────────────────────────────────────── */}
      <InsightsCard statements={insightStatements} />

      {/* ── Monthly trend + Category trend (side by side, all-time only) ── */}
      {showTrends && (
        <div className="dash-columns">

          {/* Bar chart: expenses vs income per month */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h2>Monthly Trend</h2>
              {hasBudget && <span className="dash-budget-note">Budget — {formatCurrency(budgetGoal)}</span>}
            </div>
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
                {hasBudget && (
                  <ReferenceLine
                    y={budgetGoal}
                    stroke="#ffffff"
                    strokeDasharray="6 4"
                    strokeWidth={2}
                  />
                )}
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
                    {trendCategories.filter((cat) => !hiddenCats.has(cat)).map((cat) => (
                      <Line
                        key={cat}
                        type="monotone"
                        dataKey={cat}
                        stroke={getCategoryColor(cat)}
                        strokeWidth={2}
                        dot={{ r: 3, fill: getCategoryColor(cat), strokeWidth: 0 }}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                <div className="dash-legend dash-legend-wrap">
                  {trendCategories.map((cat) => (
                    <span
                      key={cat}
                      className={`dash-legend-item${hiddenCats.has(cat) ? ' hidden' : ''}`}
                      onClick={() => toggleCat(cat)}
                      title={hiddenCats.has(cat) ? 'Show' : 'Hide'}
                    >
                      <span className="dash-legend-dot" style={{ background: getCategoryColor(cat) }} />
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
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    key={visiblePieData.map((d) => d.name).join(',')}
                    data={visiblePieData}
                    cx="50%" cy="50%"
                    innerRadius={60} outerRadius={95}
                    paddingAngle={3} dataKey="value"
                    animationBegin={0} animationDuration={450}
                  >
                    {visiblePieData.map((entry) => (
                      <Cell key={entry.name} fill={getCategoryColor(entry.name)} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, name) => [formatCurrency(v), name]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="dash-legend dash-legend-wrap">
                {categoryData.map((item) => (
                  <span
                    key={item.name}
                    className={`dash-legend-item${hiddenPieCats.has(item.name) ? ' hidden' : ''}`}
                    onClick={() => togglePieCat(item.name)}
                    title={hiddenPieCats.has(item.name) ? 'Show' : 'Hide'}
                  >
                    <span className="dash-legend-dot" style={{ background: getCategoryColor(item.name) }} />
                    {item.name}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="dash-empty-chart">No expense data</p>
          )}
        </div>

        <div className="dash-card">
          <h2>Category Breakdown</h2>
          <div className="dash-breakdown">
            {categoryData.map((item) => (
              <div key={item.name} className="dash-breakdown-row">
                <div className="dash-breakdown-dot" style={{ background: getCategoryColor(item.name) }} />
                <span className="dash-breakdown-name">{item.name}</span>
                <div className="dash-breakdown-bar-wrap">
                  <div
                    className="dash-breakdown-bar"
                    style={{ width: `${(item.value / totalExpenses) * 100}%`, background: getCategoryColor(item.name) }}
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

      {/* ── Top Merchants + Recurring vs One-time ────────────────────────── */}
      {txns.length > 0 && (
        <div className="dash-columns-wide">

          {/* Treemap: top merchants */}
          <div className="dash-card">
            <h2>Top Merchants</h2>
            {merchantData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <Treemap
                  data={merchantData}
                  dataKey="value"
                  aspectRatio={4 / 3}
                  content={(props) => (
                    <MerchantTile {...props} getCategoryColor={getCategoryColor} formatCurrency={formatCurrency} />
                  )}
                >
                  <Tooltip
                    formatter={(v, _name, props) => [formatCurrency(v), props?.payload?.name || '']}
                    contentStyle={TOOLTIP_STYLE}
                  />
                </Treemap>
              </ResponsiveContainer>
            ) : (
              <p className="dash-empty-chart">No transaction data</p>
            )}
          </div>

          {/* Donut: recurring vs one-time */}
          <div className="dash-card">
            <h2>Recurring vs One-time</h2>
            {recurringData.length > 0 ? (
              <div style={{ position: 'relative' }}>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={recurringData}
                      cx="50%" cy="50%"
                      innerRadius={60} outerRadius={88}
                      paddingAngle={3} dataKey="value"
                      startAngle={90} endAngle={-270}
                    >
                      <Cell fill={COLOR_RECURRING} />
                      <Cell fill={COLOR_ONETIME} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="dash-donut-center">
                  <span className="dash-donut-pct">{recurringPct}%</span>
                  <span className="dash-donut-label">recurring</span>
                </div>
                <div className="dash-legend" style={{ marginTop: 4 }}>
                  {recurringData.map((d) => (
                    <span key={d.name}>
                      <span className="dash-legend-dot" style={{ background: d.name === 'Recurring' ? COLOR_RECURRING : COLOR_ONETIME }} />
                      {d.name} — {formatCurrency(d.value)}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="dash-empty-chart">No transaction data</p>
            )}
          </div>
        </div>
      )}

      {/* ── Daily Spend + Savings Rate ───────────────────────────────────── */}
      {txns.length > 0 && (
        <div className={showTrends ? 'dash-columns' : 'dash-columns dash-columns-single'}>

          {/* Bar chart: spend by day of month */}
          <div className="dash-card">
            <h2>Daily Spend Pattern</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...GRID_STYLE} />
                <XAxis
                  dataKey="day"
                  tick={AXIS_TICK}
                  axisLine={AXIS_LINE}
                  tickLine={false}
                  interval={4}
                />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={AXIS_TICK}
                  width={44}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v) => [formatCurrency(v), 'Spent']}
                  labelFormatter={(d) => `Day ${d}`}
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: 'rgba(129,140,248,0.06)' }}
                />
                <Bar dataKey="amount" fill={COLOR_DAILY} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Area chart: savings rate over time (multi-month only) */}
          {showTrends && (
            <div className="dash-card">
              <h2>Savings Rate</h2>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={savingsRateData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={COLOR_INCOME} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={COLOR_INCOME} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_STYLE} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                  <YAxis
                    tickFormatter={(v) => `${v}%`}
                    tick={AXIS_TICK}
                    width={44}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [`${v}%`, 'Savings Rate']}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <ReferenceLine y={0} stroke="#2d3a52" strokeWidth={1} />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke={COLOR_INCOME}
                    strokeWidth={2}
                    fill="url(#savingsGrad)"
                    dot={{ r: 3, fill: COLOR_INCOME, strokeWidth: 0 }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MerchantTile({ x, y, width, height, name, value, category, getCategoryColor, formatCurrency }) {
  if (!width || !height || width < 2 || height < 2) return null;
  const fill = getCategoryColor(category || 'Other');
  const pad = 6;
  const label = name?.length > 18 ? name.slice(0, 18) + '…' : name;
  const showAmt  = height > 36 && width > 60;
  const showName = height > 18 && width > 40;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.82} rx={4} />
      <rect x={x} y={y} width={width} height={height} fill="none" stroke="#0d1117" strokeWidth={2} rx={4} />
      {showName && (
        <text x={x + pad} y={y + pad + 11} fontSize={11} fill="#fff" fontWeight={600} style={{ pointerEvents: 'none' }}>
          {label}
        </text>
      )}
      {showAmt && (
        <text x={x + pad} y={y + pad + 26} fontSize={10} fill="rgba(255,255,255,0.7)" style={{ pointerEvents: 'none' }}>
          {formatCurrency(value)}
        </text>
      )}
    </g>
  );
}
