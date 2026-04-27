import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { parseFile } from './parsers/index.js';
import { analyzeTransactions } from './ai/transactionAnalyzer.js';
import { normalizeTransactions } from './utils/normalizeTransactions.js';
import {
  ensureDataDir,
  listStatements,
  saveStatement,
  getStatement,
  updateStatement,
  deleteStatement,
  patchStatement,
  patchTransaction,
  deleteTransaction,
  deduplicateTransactions,
  appendTransactions,
  migrateFingerprints,
} from './utils/statementStore.js';
import { plaidClient } from './plaid/plaidClient.js';
import { getPlaidConfig, savePlaidConfig, hasPlaidConfig } from './utils/plaidStore.js';
import { CountryCode, Products } from 'plaid';
import { applyRules, getRules, setRule, deleteRule, normalizeMerchantKey } from './utils/rulesStore.js';
import { getCategories, addCategory, deleteCategory } from './utils/categoriesStore.js';
import { refineRules } from './ai/rulesRefiner.js';
import { generateInsights } from './ai/insightsAnalyzer.js';
import { getCachedInsights, setCachedInsights, clearInsightsCache } from './utils/insightsCache.js';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const app = express();
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ── Analyze ───────────────────────────────────────────────────────────────────
app.post('/api/analyze', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const { buffer, mimetype, originalname } = req.file;
  const monthlyIncome = parseFloat(req.body.monthlyIncome) || 0;

  const customCategories = await getCategories();
  const rawData = await parseFile(buffer, mimetype, originalname);
  const rawTransactions = await analyzeTransactions(rawData, customCategories);
  const normalized = normalizeTransactions(rawTransactions);
  const withRules = await applyRules(normalized);

  const { unique: transactions, duplicateCount } = await deduplicateTransactions(withRules);

  if (transactions.length === 0) {
    return res.status(409).json({
      error: `All ${duplicateCount} transaction${duplicateCount === 1 ? '' : 's'} in this file already exist in your saved statements.`,
    });
  }

  return res.json({ transactions, monthlyIncome, duplicateCount });
}));

// ── Statements CRUD ───────────────────────────────────────────────────────────

app.get('/api/statements', asyncHandler(async (_req, res) => {
  const statements = await listStatements();
  return res.json(statements);
}));

app.post('/api/statements', asyncHandler(async (req, res) => {
  const { name, monthlyIncome, transactions } = req.body;
  if (!name || !Array.isArray(transactions)) {
    return res.status(400).json({ error: 'name and transactions are required.' });
  }
  const { unique, duplicateCount } = await deduplicateTransactions(transactions);

  if (unique.length === 0) {
    return res.status(409).json({
      error: `All ${duplicateCount} transaction${duplicateCount === 1 ? '' : 's'} already exist in your saved statements.`,
    });
  }

  const statement = await saveStatement({ name, monthlyIncome: monthlyIncome || 0, transactions: unique });
  await clearInsightsCache();
  const { transactions: _tx, ...meta } = statement;
  return res.status(201).json({ ...meta, duplicateCount });
}));

app.get('/api/statements/:id', asyncHandler(async (req, res) => {
  const statement = await getStatement(req.params.id);
  if (!statement) return res.status(404).json({ error: 'Statement not found.' });
  return res.json(statement);
}));

app.put('/api/statements/:id', asyncHandler(async (req, res) => {
  const { name, monthlyIncome, transactions } = req.body;
  if (!Array.isArray(transactions)) {
    return res.status(400).json({ error: 'transactions array is required.' });
  }
  const updated = await updateStatement(req.params.id, { name, monthlyIncome, transactions });
  if (!updated) return res.status(404).json({ error: 'Statement not found.' });
  await clearInsightsCache();
  const { transactions: _tx, ...meta } = updated;
  return res.json(meta);
}));

app.patch('/api/statements/:id', asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name (string) is required.' });
  }
  const updated = await patchStatement(req.params.id, { name: name.trim() });
  if (!updated) return res.status(404).json({ error: 'Statement not found.' });
  const { transactions: _tx, ...meta } = updated;
  return res.json(meta);
}));

app.delete('/api/statements/:stmtId/transactions/:txId', asyncHandler(async (req, res) => {
  const { stmtId, txId } = req.params;
  const result = await deleteTransaction(stmtId, txId);
  if (!result) return res.status(404).json({ error: 'Statement or transaction not found.' });
  await clearInsightsCache();
  return res.json({ ok: true });
}));

app.patch('/api/statements/:stmtId/transactions/:txId', asyncHandler(async (req, res) => {
  const { stmtId, txId } = req.params;
  const { flagged, category, isRecurring } = req.body;
  const patch = {};
  if (typeof flagged === 'boolean') patch.flagged = flagged;
  if (typeof category === 'string') patch.category = category;
  if (typeof isRecurring === 'boolean') patch.isRecurring = isRecurring;
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'No patchable fields provided.' });
  }
  const tx = await patchTransaction(stmtId, txId, patch);
  if (!tx) return res.status(404).json({ error: 'Statement or transaction not found.' });
  return res.json(tx);
}));

app.delete('/api/statements/:id', asyncHandler(async (req, res) => {
  const deleted = await deleteStatement(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Statement not found.' });
  await clearInsightsCache();
  return res.json({ ok: true });
}));

// ── AI Insights ───────────────────────────────────────────────────────────────
app.post('/api/insights', asyncHandler(async (req, res) => {
  const { statements, force } = req.body;
  if (!Array.isArray(statements) || statements.length === 0) {
    return res.status(400).json({ error: 'statements array required.' });
  }

  const ids = statements.map((s) => s.id);

  if (!force) {
    const cached = await getCachedInsights(ids);
    if (cached) return res.json(cached);
  }

  const insights = await generateInsights(statements);
  const result = { insights, generatedAt: new Date().toISOString() };
  await setCachedInsights(ids, insights);
  return res.json(result);
}));

// ── Custom Categories CRUD ────────────────────────────────────────────────────

app.get('/api/categories', asyncHandler(async (_req, res) => {
  return res.json(await getCategories());
}));

app.post('/api/categories', asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const added = await addCategory(name);
  if (!added) return res.status(409).json({ error: 'Category already exists.' });
  return res.status(201).json({ name: added });
}));

app.delete('/api/categories/:name', asyncHandler(async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!/^[\w\s\-&'.]+$/u.test(name)) {
    return res.status(400).json({ error: 'Invalid category name.' });
  }
  const deleted = await deleteCategory(name);
  if (!deleted) return res.status(404).json({ error: 'Category not found.' });
  return res.json({ ok: true });
}));

// ── Rules CRUD ────────────────────────────────────────────────────────────────

// Refine rules with AI (must come before /:key routes)
app.post('/api/rules/refine', asyncHandler(async (_req, res) => {
  const rules = await getRules();
  const result = await refineRules(rules);
  return res.json(result);
}));

app.get('/api/rules', asyncHandler(async (_req, res) => {
  return res.json(await getRules());
}));

app.post('/api/rules', asyncHandler(async (req, res) => {
  const { merchant, category, isRecurring } = req.body;
  if (!merchant || !category) return res.status(400).json({ error: 'merchant and category required.' });
  await setRule(merchant, category, isRecurring);
  return res.json({ ok: true });
}));

app.delete('/api/rules/:key', asyncHandler(async (req, res) => {
  const deleted = await deleteRule(decodeURIComponent(req.params.key));
  if (!deleted) return res.status(404).json({ error: 'Rule not found.' });
  return res.json({ ok: true });
}));

// ── Rule utilities ────────────────────────────────────────────────────────────

/**
 * POST /api/rules/test  { description: string }
 * Runs the exact same matching algorithm as applyRules and returns which rule
 * (if any) would fire for the given raw transaction description.
 */
app.post('/api/rules/test', asyncHandler(async (req, res) => {
  const { description } = req.body;
  if (typeof description !== 'string') return res.status(400).json({ error: 'description required.' });
  const rules = await getRules();
  const ruleKeys = Object.keys(rules);
  const norm = normalizeMerchantKey(description);

  const collapsedKeys = Object.fromEntries(
    ruleKeys.filter((k) => k.includes(' ')).map((k) => [k, k.replace(/\s+/g, '')])
  );
  const normCollapsed = norm.replace(/\s+/g, '');
  let bestKey = null, bestLen = 0;
  for (const key of ruleKeys) {
    if (key.length <= bestLen) continue;
    const kc = collapsedKeys[key];
    if (
      norm === key ||
      (norm.startsWith(key) && (norm[key.length] === ' ' || norm[key.length] === '*')) ||
      (kc && (normCollapsed === kc || normCollapsed.startsWith(kc)))
    ) { bestKey = key; bestLen = key.length; }
  }

  if (bestKey) {
    const rule = rules[bestKey];
    return res.json({ matched: true, key: bestKey, category: rule.category, isRecurring: rule.isRecurring, normalizedInput: norm });
  }
  return res.json({ matched: false, normalizedInput: norm });
}));

/**
 * GET /api/rules/suggestions
 * Returns expense merchants appearing 2+ times across all statements with no
 * matching rule, sorted by frequency. Also includes redundancy warnings: if a
 * new rule for this merchant key would subsume an existing narrower rule.
 */
app.get('/api/rules/suggestions', asyncHandler(async (_req, res) => {
  const [allStatements, rules] = await Promise.all([listStatements(), getRules()]);
  const ruleKeys = Object.keys(rules);

  const freq = new Map(); // normKey → { count, lastSeen, exampleDescription }
  await Promise.all(allStatements.map(async (meta) => {
    const stmt = await getStatement(meta.id);
    if (!stmt) return;
    for (const tx of (stmt.transactions || [])) {
      if (tx.isDeposit || tx.ruleApplied) continue;
      const norm = normalizeMerchantKey(tx.description);
      if (!norm) continue;
      const e = freq.get(norm) || { count: 0, lastSeen: '', exampleDescription: tx.description };
      e.count += 1;
      if (tx.date > e.lastSeen) { e.lastSeen = tx.date; e.exampleDescription = tx.description; }
      freq.set(norm, e);
    }
  }));

  const suggestions = Array.from(freq.entries())
    .filter(([normKey, e]) => e.count >= 2 && !rules[normKey]) // skip keys that already have an exact rule
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 20)
    .map(([normalizedKey, e]) => {
      // Redundancy check: an existing rule R is subsumed by this new rule when
      // the new key is a prefix of R (with word boundary). Every transaction that
      // would have matched R will also match the new shorter key.
      const redundantKeys = ruleKeys.filter((r) =>
        r === normalizedKey ||
        (r.startsWith(normalizedKey) && (r[normalizedKey.length] === ' ' || r[normalizedKey.length] === '*'))
      );
      return {
        normalizedKey,
        count: e.count,
        lastSeen: e.lastSeen,
        exampleDescription: e.exampleDescription,
        redundantRules: redundantKeys.map((r) => ({ key: r, ...rules[r] })),
      };
    });

  return res.json(suggestions);
}));

/**
 * GET /api/rules/stats
 * For each rule key, returns how many transactions across all statements it has
 * matched and when the most recent match was. Uses the same matching algorithm
 * as applyRules so counts are accurate.
 */
app.get('/api/rules/stats', asyncHandler(async (_req, res) => {
  const [allStatements, rules] = await Promise.all([listStatements(), getRules()]);
  const ruleKeys = Object.keys(rules);
  if (ruleKeys.length === 0) return res.json({});

  const collapsedKeys = Object.fromEntries(
    ruleKeys.filter((k) => k.includes(' ')).map((k) => [k, k.replace(/\s+/g, '')])
  );
  const stats = Object.fromEntries(ruleKeys.map((k) => [k, { matchCount: 0, lastMatchedDate: null }]));

  await Promise.all(allStatements.map(async (meta) => {
    const stmt = await getStatement(meta.id);
    if (!stmt) return;
    for (const tx of (stmt.transactions || [])) {
      if (!tx.ruleApplied || tx.isDeposit) continue;
      const norm = normalizeMerchantKey(tx.description);
      const normCollapsed = norm.replace(/\s+/g, '');
      let bestKey = null, bestLen = 0;
      for (const key of ruleKeys) {
        if (key.length <= bestLen) continue;
        const kc = collapsedKeys[key];
        if (
          norm === key ||
          (norm.startsWith(key) && (norm[key.length] === ' ' || norm[key.length] === '*')) ||
          (kc && (normCollapsed === kc || normCollapsed.startsWith(kc)))
        ) { bestKey = key; bestLen = key.length; }
      }
      if (bestKey && stats[bestKey]) {
        stats[bestKey].matchCount += 1;
        if (!stats[bestKey].lastMatchedDate || tx.date > stats[bestKey].lastMatchedDate) {
          stats[bestKey].lastMatchedDate = tx.date;
        }
      }
    }
  }));

  return res.json(stats);
}));

// ── Statements append (used by Plaid sync save) ───────────────────────────────
app.post('/api/statements/:id/append', asyncHandler(async (req, res) => {
  const { transactions } = req.body;
  if (!Array.isArray(transactions)) {
    return res.status(400).json({ error: 'transactions array is required.' });
  }
  const result = await appendTransactions(req.params.id, transactions);
  if (!result) return res.status(404).json({ error: 'Statement not found.' });
  await clearInsightsCache();
  const { transactions: _tx, ...meta } = result;
  return res.json({ ...meta, appendedCount: result.appendedCount });
}));

// ── Plaid bank sync ───────────────────────────────────────────────────────────

app.post('/api/plaid/link-token', asyncHandler(async (_req, res) => {
  let response;
  try {
    response = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'finch-user' },
      client_name: 'Finch',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
  } catch (err) {
    console.error('[Plaid] link-token failed:', err.response?.data || err.message);
    const e = new Error('Failed to create link token.');
    e.status = 500;
    throw e;
  }
  return res.json({ linkToken: response.data.link_token });
}));

app.post('/api/plaid/exchange-token', asyncHandler(async (req, res) => {
  const { publicToken } = req.body;
  if (!publicToken) return res.status(400).json({ error: 'publicToken is required.' });
  let response;
  try {
    response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
  } catch (err) {
    console.error('[Plaid] exchange-token failed:', err.response?.data || err.message);
    const e = new Error('Failed to connect bank account.');
    e.status = 500;
    throw e;
  }
  await savePlaidConfig({ accessToken: response.data.access_token, cursor: undefined });
  return res.json({ ok: true });
}));

app.post('/api/plaid/sync', asyncHandler(async (_req, res) => {
  const config = await getPlaidConfig();
  if (!config.accessToken) {
    return res.status(400).json({ error: 'No bank account connected. Please link your account first.' });
  }

  let cursor = config.cursor;
  let added = [];
  let hasMore = true;

  try {
    while (hasMore) {
      const params = { access_token: config.accessToken };
      if (cursor) params.cursor = cursor;

      const response = await plaidClient.transactionsSync(params);
      const { data } = response;

      added = added.concat(data.added);
      cursor = data.next_cursor;
      hasMore = data.has_more;
    }
  } catch (err) {
    console.error('[Plaid] sync failed:', err.response?.data || err.message);
    const e = new Error('Sync failed. Please try again.');
    e.status = 500;
    throw e;
  }

  if (added.length === 0) {
    await savePlaidConfig({ cursor });
    return res.json({ groups: [], duplicateCount: 0, message: 'No new transactions.' });
  }

  const rawTransactions = added.map((t) => ({
    source: t.merchant_name || t.name || 'Unknown',
    amount: -(t.amount),
    date: t.date,
    activity: t.payment_channel || '',
  }));

  const customCategories = await getCategories();
  const analyzed = await analyzeTransactions(rawTransactions, customCategories);
  const normalized = normalizeTransactions(analyzed);
  const withRules = await applyRules(normalized);

  const { unique, duplicateCount } = await deduplicateTransactions(withRules);

  if (unique.length === 0) {
    return res.json({ groups: [], duplicateCount, message: 'All synced transactions already exist.' });
  }

  const byMonth = {};
  for (const t of unique) {
    const ym = t.date ? t.date.slice(0, 7) : 'unknown';
    if (!byMonth[ym]) byMonth[ym] = [];
    byMonth[ym].push(t);
  }

  const savedStatements = await listStatements();
  const statementByPeriod = new Map(
    savedStatements
      .filter((s) => s.period)
      .map((s) => [`${s.period.year}-${String(s.period.month).padStart(2, '0')}`, s.id])
  );

  const currentYM = new Date().toISOString().slice(0, 7);

  const groups = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([ym]) => ym === currentYM || !statementByPeriod.has(ym))
    .map(([ym, transactions]) => {
      const [year, month] = ym.split('-');
      const name = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
      const existingStatementId = statementByPeriod.get(ym) || null;
      return { ym, name, transactions, existingStatementId };
    });

  return res.json({ groups, duplicateCount, cursor });
}));

app.post('/api/plaid/advance-cursor', asyncHandler(async (req, res) => {
  const { cursor } = req.body;
  if (!cursor) return res.status(400).json({ error: 'cursor is required.' });
  await savePlaidConfig({ cursor });
  return res.json({ ok: true });
}));

app.get('/api/plaid/status', asyncHandler(async (_req, res) => {
  const connected = await hasPlaidConfig();
  return res.json({ connected });
}));

// ── Error middleware ──────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (err.message === 'Invalid statement id.') {
    return res.status(400).json({ error: err.message });
  }
  console.error(`[${err.name || 'Error'}]`, err.message);
  res.status(err.status || 500).json({ error: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT || 3001;
  ensureDataDir()
    .then(migrateFingerprints)
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Finch server running on http://localhost:${PORT}`);
      });
    });
}

export { app };
