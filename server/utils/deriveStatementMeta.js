export const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Derives period label and pre-computes summary from a transactions array.
 * Returns { period, summary }.
 */
export function deriveStatementMeta(transactions, monthlyIncome) {
  // --- Period ---
  const monthCounts = {};
  for (const t of transactions) {
    if (t.date && /^\d{4}-\d{2}/.test(t.date)) {
      const ym = t.date.slice(0, 7); // "YYYY-MM"
      monthCounts[ym] = (monthCounts[ym] || 0) + 1;
    }
  }

  let period = null;
  const ymKeys = Object.keys(monthCounts);
  if (ymKeys.length > 0) {
    const total = Object.values(monthCounts).reduce((s, n) => s + n, 0);
    // Pick the month that has >= 40% of dated transactions (mode)
    const best = ymKeys.sort((a, b) => monthCounts[b] - monthCounts[a])[0];
    if (monthCounts[best] / total >= 0.4) {
      const [y, m] = best.split('-').map(Number);
      period = { year: y, month: m, label: `${MONTH_NAMES[m - 1]} ${y}` };
    }
  }

  // Fallback: use earliest available month
  if (!period && ymKeys.length > 0) {
    const earliest = ymKeys.sort()[0];
    const [y, m] = earliest.split('-').map(Number);
    period = { year: y, month: m, label: `${MONTH_NAMES[m - 1]} ${y}` };
  }

  if (!period) {
    const now = new Date();
    period = {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      label: `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`,
    };
  }

  // --- Summary ---
  const byCategory = {};
  let totalExpenses = 0;
  let totalDeposits = 0;

  let totalTransfers = 0;

  for (const t of transactions) {
    const amt = Math.abs(t.amount);
    if (t.isDeposit) {
      // Deposits always count as income — category is irrelevant for deposits
      totalDeposits += amt;
    } else if (t.category === 'Transfers') {
      // Expense-side transfers: not counted as spending, deducted from income instead
      totalTransfers += amt;
    } else {
      totalExpenses += amt;
      byCategory[t.category] = (byCategory[t.category] || 0) + amt;
    }
  }

  // Transfers reduce income — money sent to another account offsets incoming deposits
  totalDeposits = Math.max(0, totalDeposits - totalTransfers);

  // Round all values to 2 decimal places
  for (const cat of Object.keys(byCategory)) {
    byCategory[cat] = parseFloat(byCategory[cat].toFixed(2));
  }

  return {
    period,
    summary: {
      totalExpenses: parseFloat(totalExpenses.toFixed(2)),
      totalDeposits: parseFloat(totalDeposits.toFixed(2)),
      transactionCount: transactions.length,
      byCategory,
    },
  };
}
