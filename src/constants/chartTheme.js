/**
 * Shared Recharts configuration.
 * Recharts can't read CSS custom properties at runtime, so colors live here as JS constants.
 * CSS vars mirror these values in index.css under --chart-* for use in plain CSS.
 */
export const CHART_COLORS = {
  expenses:  '#f87171', // --negative
  income:    '#34d399', // --positive
  accent:    '#818cf8', // --accent
  merchants: '#2dd4bf', // --chart-merchants (cyan-teal)
  recurring: '#38bdf8', // --chart-recurring (sky)
  onetime:   '#a78bfa', // --chart-onetime   (violet — upgraded from slate)
  daily:     '#fb923c', // --chart-daily      (orange)
};

export const TOOLTIP_STYLE = {
  borderRadius: '10px',
  border: '1px solid #2d3a52',
  fontSize: 12,
  background: '#1c2338',
  color: '#f1f5f9',
};

export const AXIS_TICK  = { fontSize: 11, fill: '#8898aa' };
export const AXIS_LINE  = { stroke: '#2d3a52' };
export const GRID_STYLE = { strokeDasharray: '3 3', stroke: '#1e2a3f' };
