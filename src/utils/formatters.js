export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Math.abs(amount));
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Format an ISO timestamp (savedAt, generatedAt) to a readable date string. */
export function formatISODate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const MONTHS_LONG = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/**
 * Convert a "YYYY-MM" string to a human-readable label like "March 2024".
 * Falls back gracefully for unknown/missing values.
 */
export function ymToLabel(ym) {
  if (!ym || ym === 'no-date' || ym === 'unknown') return 'Unknown Month';
  const [y, m] = ym.split('-').map(Number);
  return (y && m) ? `${MONTHS_LONG[m - 1]} ${y}` : ym;
}

/**
 * Split a flat transaction array into per-month groups sorted chronologically.
 * Returns [{ ym, name, transactions }]
 */
export function groupByMonth(transactions) {
  const map = new Map();
  for (const t of transactions) {
    const ym = t.date?.slice(0, 7) || 'no-date';
    if (!map.has(ym)) map.set(ym, []);
    map.get(ym).push(t);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, txns]) => ({ ym, name: ymToLabel(ym), transactions: txns }));
}
