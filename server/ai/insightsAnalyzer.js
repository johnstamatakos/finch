import { createMessage } from './providers/index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function normDesc(desc) {
  return (desc || '').toLowerCase().trim();
}

function daysDiff(dateA, dateB) {
  return Math.abs(new Date(dateA) - new Date(dateB)) / 86_400_000;
}

function fmt(amount) {
  return `$${Math.abs(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

// ── Algorithmic: duplicate detection ─────────────────────────────────────────

function findDuplicates(allTxns) {
  const expenses = allTxns.filter((t) => !t.isDeposit && t.amount >= 5);

  // Group by normalised description + amount
  const groups = new Map();
  for (const tx of expenses) {
    const key = `${normDesc(tx.description)}|${tx.amount}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }

  const results = [];
  for (const txs of groups.values()) {
    if (txs.length < 2) continue;
    // Find the most-recent pair within 31 days
    const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (a.id === b.id) continue;
      if (daysDiff(a.date, b.date) <= 31) {
        results.push({
          type: 'duplicate',
          message: `Possible duplicate: "${a.description}" charged twice — ${fmt(a.amount)}`,
          transactions: [
            { id: a.id, date: a.date, description: a.description, amount: a.amount, _statementId: a._statementId },
            { id: b.id, date: b.date, description: b.description, amount: b.amount, _statementId: b._statementId },
          ],
          _sortDate: a.date,
        });
        break; // one pair per merchant+amount group
      }
    }
  }

  // Return up to 3 most recent
  return results
    .sort((a, b) => b._sortDate.localeCompare(a._sortDate))
    .slice(0, 3)
    .map(({ _sortDate: _d, ...rest }) => rest);
}

// ── Algorithmic: suspicious transaction detection ─────────────────────────────

function findSuspicious(allTxns) {
  const expenses = allTxns.filter((t) => !t.isDeposit && t.amount > 0);

  // Per-category stats
  const catAmounts = {};
  for (const tx of expenses) {
    const cat = tx.category || 'Other';
    if (!catAmounts[cat]) catAmounts[cat] = [];
    catAmounts[cat].push(tx.amount);
  }

  const catStats = {};
  for (const [cat, amounts] of Object.entries(catAmounts)) {
    if (amounts.length < 3) continue; // need enough data for stats to be meaningful
    const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    const variance = amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length;
    const stddev = Math.sqrt(variance);
    catStats[cat] = { mean, stddev };
  }

  // Count occurrences per merchant across all transactions
  const merchantCount = {};
  for (const tx of expenses) {
    const k = normDesc(tx.description);
    merchantCount[k] = (merchantCount[k] || 0) + 1;
  }

  const flagged = [];
  const seen = new Set();

  for (const tx of expenses) {
    if (seen.has(tx.id)) continue;
    const cat = tx.category || 'Other';
    const stats = catStats[cat];
    const isStatOutlier =
      stats &&
      tx.amount >= 75 &&
      tx.amount > stats.mean + 2.5 * stats.stddev;

    const isOneTimeHigh =
      tx.amount >= 300 &&
      merchantCount[normDesc(tx.description)] === 1;

    if (isStatOutlier || isOneTimeHigh) {
      const multiplier = stats ? (tx.amount / stats.mean).toFixed(1) : null;
      const msg = multiplier
        ? `Unusual ${fmt(tx.amount)} at "${tx.description}" — ${multiplier}× avg ${cat} spend`
        : `Large one-time charge: ${fmt(tx.amount)} at "${tx.description}"`;

      flagged.push({
        type: 'suspicious',
        message: msg.length > 120 ? msg.slice(0, 117) + '…' : msg,
        transactions: [
          { id: tx.id, date: tx.date, description: tx.description, amount: tx.amount, _statementId: tx._statementId },
        ],
        _amount: tx.amount,
      });
      seen.add(tx.id);
    }
  }

  // Return up to 3 highest-amount outliers
  return flagged
    .sort((a, b) => b._amount - a._amount)
    .slice(0, 3)
    .map(({ _amount: _a, ...rest }) => rest);
}

// ── Recurring context for AI prompt ──────────────────────────────────────────

function buildRecurringContext(allTxns) {
  const recurring = allTxns.filter((t) => !t.isDeposit && t.isRecurring && t.amount > 0);
  if (recurring.length === 0) return null;

  const byDesc = {};
  for (const tx of recurring) {
    const k = normDesc(tx.description);
    if (!byDesc[k]) byDesc[k] = { description: tx.description, amounts: [] };
    byDesc[k].amounts.push(tx.amount);
  }

  const merchants = Object.values(byDesc)
    .map(({ description, amounts }) => ({
      description,
      monthly: amounts.reduce((s, v) => s + v, 0) / amounts.length,
    }))
    .sort((a, b) => b.monthly - a.monthly)
    .slice(0, 10);

  const totalMonthly = merchants.reduce((s, m) => s + m.monthly, 0);
  return { totalMonthly, merchants };
}

// ── AI prompt ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a personal finance analyst. Given monthly bank statement summaries, generate short, specific, data-driven insights.

Each insight is a JSON object: { "type": "warning"|"positive"|"info"|"saving", "message": "..." }
- "warning": high spend, rising category, spending > income
- "positive": spending down, good savings rate, improvement vs prior period
- "info": neutral observation or pattern
- "saving": specific subscription or category where the user could cut spending — name the merchant and amount

Rules:
- Use totalDeposits as the income figure
- Reference actual dollar amounts and category/merchant names
- For multiple months, compare month-over-month or to average
- Each message must be under 120 characters
- Be direct — skip filler like "It looks like..." or "You might want to..."
- Do NOT generate duplicate or suspicious transaction insights — those are handled separately
- Return ONLY a valid JSON array, no markdown fences
- Aim for 3–6 insights total`;

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateInsights(statements) {
  // Flatten all transactions, stamping each with its statement ID
  const allTxns = statements.flatMap((s) =>
    (s.transactions || []).map((t) => ({ ...t, _statementId: s.id }))
  );

  // Algorithmic analysis — pure JS, no AI cost
  const duplicates = findDuplicates(allTxns);
  const suspicious = findSuspicious(allTxns);
  const recurring  = buildRecurringContext(allTxns);

  // Compact summaries for Claude
  const summaries = statements.map((s) => ({
    period:           s.period?.label ?? s.name,
    totalDeposits:    s.summary?.totalDeposits  ?? 0,
    totalExpenses:    s.summary?.totalExpenses  ?? 0,
    byCategory:       s.summary?.byCategory     ?? {},
    transactionCount: s.summary?.transactionCount ?? 0,
  }));

  // Build the user message — compact, not the raw transactions
  const userMsg = {
    statements: summaries,
    ...(recurring ? { recurringSubscriptions: recurring } : {}),
    algorithmicFindings: `${duplicates.length} potential duplicate pair(s) and ${suspicious.length} unusual charge(s) already reported separately.`,
  };

  const text = await createMessage({
    maxTokens: 1024,
    systemPrompt: SYSTEM_PROMPT,
    userMessage: JSON.stringify(userMsg),
  });

  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const aiInsights = JSON.parse(json);

  return [...duplicates, ...suspicious, ...aiInsights];
}
