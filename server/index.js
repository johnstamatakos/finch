import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
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
  getAllFingerprints,
  appendTransactions,
} from './utils/statementStore.js';
import { plaidClient } from './plaid/plaidClient.js';
import { getPlaidConfig, savePlaidConfig, hasPlaidConfig } from './utils/plaidStore.js';
import { CountryCode, Products } from 'plaid';
import { applyRules, getRules, setRule, deleteRule } from './utils/rulesStore.js';
import { refineRules } from './ai/rulesRefiner.js';
import { generateInsights } from './ai/insightsAnalyzer.js';
import { getCachedInsights, setCachedInsights, clearInsightsCache } from './utils/insightsCache.js';

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ── Analyze (existing) ────────────────────────────────────────────────────────
app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const { buffer, mimetype, originalname } = req.file;
    const monthlyIncome = parseFloat(req.body.monthlyIncome) || 0;

    const rawData = await parseFile(buffer, mimetype, originalname);
    const rawTransactions = await analyzeTransactions(rawData);
    const normalized = normalizeTransactions(rawTransactions);
    const withRules = await applyRules(normalized);

    // Filter out transactions already saved — dedup before review, not just before save
    const existingFingerprints = await getAllFingerprints();
    const transactions = withRules.filter((t) => !existingFingerprints.has(t.fingerprint));
    const duplicateCount = withRules.length - transactions.length;

    if (transactions.length === 0) {
      return res.status(409).json({
        error: `All ${duplicateCount} transaction${duplicateCount === 1 ? '' : 's'} in this file already exist in your saved statements.`,
      });
    }

    return res.json({ transactions, monthlyIncome, duplicateCount });
  } catch (err) {
    console.error('Error in /api/analyze:', err.message);
    return res.status(500).json({ error: err.message || 'Internal server error.' });
  }
});

// ── Statements CRUD ───────────────────────────────────────────────────────────

// List all (metadata only, no transactions)
app.get('/api/statements', async (_req, res) => {
  try {
    const statements = await listStatements();
    return res.json(statements);
  } catch (err) {
    console.error('Error in GET /api/statements:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Save a new statement
app.post('/api/statements', async (req, res) => {
  try {
    const { name, monthlyIncome, transactions } = req.body;
    if (!name || !Array.isArray(transactions)) {
      return res.status(400).json({ error: 'name and transactions are required.' });
    }
    const existingFingerprints = await getAllFingerprints();
    const unique = transactions.filter((t) => !existingFingerprints.has(t.fingerprint));
    const duplicateCount = transactions.length - unique.length;

    if (unique.length === 0) {
      return res.status(409).json({
        error: `All ${duplicateCount} transaction${duplicateCount === 1 ? '' : 's'} already exist in your saved statements.`,
      });
    }

    const statement = await saveStatement({ name, monthlyIncome: monthlyIncome || 0, transactions: unique });
    await clearInsightsCache();
    const { transactions: _tx, ...meta } = statement;
    return res.status(201).json({ ...meta, duplicateCount });
  } catch (err) {
    console.error('Error in POST /api/statements:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Get single statement (includes transactions)
app.get('/api/statements/:id', async (req, res) => {
  try {
    const statement = await getStatement(req.params.id);
    if (!statement) return res.status(404).json({ error: 'Statement not found.' });
    return res.json(statement);
  } catch (err) {
    if (err.message === 'Invalid statement id.') return res.status(400).json({ error: err.message });
    console.error('Error in GET /api/statements/:id:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Update an existing statement (name, income, or re-categorized transactions)
app.put('/api/statements/:id', async (req, res) => {
  try {
    const { name, monthlyIncome, transactions } = req.body;
    if (!Array.isArray(transactions)) {
      return res.status(400).json({ error: 'transactions array is required.' });
    }
    const updated = await updateStatement(req.params.id, { name, monthlyIncome, transactions });
    if (!updated) return res.status(404).json({ error: 'Statement not found.' });
    await clearInsightsCache();
    const { transactions: _tx, ...meta } = updated;
    return res.json(meta);
  } catch (err) {
    if (err.message === 'Invalid statement id.') return res.status(400).json({ error: err.message });
    console.error('Error in PUT /api/statements/:id:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Patch statement metadata (e.g. rename)
app.patch('/api/statements/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name (string) is required.' });
    }
    const updated = await patchStatement(req.params.id, { name: name.trim() });
    if (!updated) return res.status(404).json({ error: 'Statement not found.' });
    const { transactions: _tx, ...meta } = updated;
    return res.json(meta);
  } catch (err) {
    if (err.message === 'Invalid statement id.') return res.status(400).json({ error: err.message });
    console.error('Error in PATCH /api/statements/:id:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Delete a single transaction
app.delete('/api/statements/:stmtId/transactions/:txId', async (req, res) => {
  try {
    const { stmtId, txId } = req.params;
    const result = await deleteTransaction(stmtId, txId);
    if (!result) return res.status(404).json({ error: 'Statement or transaction not found.' });
    await clearInsightsCache();
    return res.json({ ok: true });
  } catch (err) {
    if (err.message === 'Invalid statement id.') return res.status(400).json({ error: err.message });
    console.error('Error in DELETE /api/statements/:stmtId/transactions/:txId:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Patch a single transaction (e.g. toggle flagged, change category)
app.patch('/api/statements/:stmtId/transactions/:txId', async (req, res) => {
  try {
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
  } catch (err) {
    if (err.message === 'Invalid statement id.') return res.status(400).json({ error: err.message });
    console.error('Error in PATCH /api/statements/:stmtId/transactions/:txId:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Delete a statement
app.delete('/api/statements/:id', async (req, res) => {
  try {
    const deleted = await deleteStatement(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Statement not found.' });
    await clearInsightsCache();
    return res.json({ ok: true });
  } catch (err) {
    if (err.message === 'Invalid statement id.') return res.status(400).json({ error: err.message });
    console.error('Error in DELETE /api/statements/:id:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── AI Insights ───────────────────────────────────────────────────────────────
app.post('/api/insights', async (req, res) => {
  try {
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
  } catch (err) {
    console.error('Error in POST /api/insights:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to generate insights.' });
  }
});

// ── Rules CRUD ────────────────────────────────────────────────────────────────

// Refine rules with AI (must come before /:key routes)
app.post('/api/rules/refine', async (_req, res) => {
  try {
    const rules = await getRules();
    const result = await refineRules(rules);
    return res.json(result);
  } catch (err) {
    console.error('Error in POST /api/rules/refine:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to refine rules.' });
  }
});

app.get('/api/rules', async (_req, res) => {
  try {
    const rules = await getRules();
    return res.json(rules);
  } catch (err) {
    console.error('Error in GET /api/rules:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/rules', async (req, res) => {
  try {
    const { merchant, category, isRecurring } = req.body;
    if (!merchant || !category) return res.status(400).json({ error: 'merchant and category required.' });
    await setRule(merchant, category, isRecurring);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error in POST /api/rules:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/rules/:key', async (req, res) => {
  try {
    const deleted = await deleteRule(decodeURIComponent(req.params.key));
    if (!deleted) return res.status(404).json({ error: 'Rule not found.' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error in DELETE /api/rules/:key:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Statements append (used by Plaid sync save) ───────────────────────────────
app.post('/api/statements/:id/append', async (req, res) => {
  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions)) {
      return res.status(400).json({ error: 'transactions array is required.' });
    }
    const result = await appendTransactions(req.params.id, transactions);
    if (!result) return res.status(404).json({ error: 'Statement not found.' });
    await clearInsightsCache();
    const { transactions: _tx, ...meta } = result;
    return res.json({ ...meta, appendedCount: result.appendedCount });
  } catch (err) {
    if (err.message === 'Invalid statement id.') return res.status(400).json({ error: err.message });
    console.error('Error in POST /api/statements/:id/append:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Plaid bank sync ───────────────────────────────────────────────────────────

// Create a Link token so the frontend can open Plaid Link
app.post('/api/plaid/link-token', async (_req, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'finch-user' },
      client_name: 'Finch',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });
    return res.json({ linkToken: response.data.link_token });
  } catch (err) {
    console.error('Error in POST /api/plaid/link-token:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Failed to create link token.' });
  }
});

// Exchange public token for access token after Plaid Link success
app.post('/api/plaid/exchange-token', async (req, res) => {
  try {
    const { publicToken } = req.body;
    if (!publicToken) return res.status(400).json({ error: 'publicToken is required.' });
    const response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
    await savePlaidConfig({ accessToken: response.data.access_token, cursor: undefined });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error in POST /api/plaid/exchange-token:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Failed to exchange token.' });
  }
});

// Sync new transactions from Plaid
app.post('/api/plaid/sync', async (_req, res) => {
  try {
    const config = await getPlaidConfig();
    if (!config.accessToken) {
      return res.status(400).json({ error: 'No bank account connected. Please link your account first.' });
    }

    // Paginate through all new transactions since last cursor
    let cursor = config.cursor;
    let added = [];
    let hasMore = true;

    while (hasMore) {
      const params = { access_token: config.accessToken };
      if (cursor) params.cursor = cursor;

      const response = await plaidClient.transactionsSync(params);
      const { data } = response;

      added = added.concat(data.added);
      cursor = data.next_cursor;
      hasMore = data.has_more;
    }

    // Save the new cursor immediately
    await savePlaidConfig({ cursor });

    if (added.length === 0) {
      return res.json({ groups: [], duplicateCount: 0, message: 'No new transactions.' });
    }

    // Convert Plaid format → our pipeline format
    // Plaid: positive = debit (money out), negative = credit (money in)
    const rawTransactions = added.map((t) => ({
      source: t.merchant_name || t.name || 'Unknown',
      amount: -(t.amount), // flip sign: positive = deposit in our system
      date: t.date,
      activity: t.payment_channel || '',
    }));

    // Run through AI categorization → normalize → apply rules
    const analyzed = await analyzeTransactions(rawTransactions);
    const normalized = normalizeTransactions(analyzed);
    const withRules = await applyRules(normalized);

    // Fingerprint dedup against all saved transactions
    const existingFingerprints = await getAllFingerprints();
    const unique = withRules.filter((t) => !existingFingerprints.has(t.fingerprint));
    const duplicateCount = withRules.length - unique.length;

    if (unique.length === 0) {
      return res.json({ groups: [], duplicateCount, message: 'All synced transactions already exist.' });
    }

    // Group by YYYY-MM
    const byMonth = {};
    for (const t of unique) {
      const ym = t.date ? t.date.slice(0, 7) : 'unknown';
      if (!byMonth[ym]) byMonth[ym] = [];
      byMonth[ym].push(t);
    }

    // Map existing statements by period for lookup
    const savedStatements = await listStatements();
    const statementByPeriod = new Map(
      savedStatements
        .filter((s) => s.period)
        .map((s) => [`${s.period.year}-${String(s.period.month).padStart(2, '0')}`, s.id])
    );

    // Only process months that have no existing statement, OR the current calendar month
    // (which may be mid-month and worth appending to).
    // Past months with existing CSV-uploaded statements are skipped — fingerprint dedup
    // can't match across different data sources (Plaid names vs raw bank text).
    const currentYM = new Date().toISOString().slice(0, 7);

    const groups = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([ym]) => ym === currentYM || !statementByPeriod.has(ym))
      .map(([ym, transactions]) => {
        const [year, month] = ym.split('-');
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const name = `${monthNames[parseInt(month, 10) - 1]} ${year}`;
        const existingStatementId = statementByPeriod.get(ym) || null;
        return { ym, name, transactions, existingStatementId };
      });

    return res.json({ groups, duplicateCount });
  } catch (err) {
    console.error('Error in POST /api/plaid/sync:', err.response?.data || err.message);
    return res.status(500).json({ error: err.message || 'Sync failed.' });
  }
});

// Check if a bank account is connected
app.get('/api/plaid/status', async (_req, res) => {
  try {
    const connected = await hasPlaidConfig();
    return res.json({ connected });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
ensureDataDir().then(() => {
  app.listen(PORT, () => {
    console.log(`Finch server running on http://localhost:${PORT}`);
  });
});
