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
  getAllFingerprints,
} from './utils/statementStore.js';
import { applyRules, getRules, setRule, deleteRule } from './utils/rulesStore.js';
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
    const transactions = await applyRules(normalized);

    return res.json({ transactions, monthlyIncome });
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
    const { merchant, category } = req.body;
    if (!merchant || !category) return res.status(400).json({ error: 'merchant and category required.' });
    await setRule(merchant, category);
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

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
ensureDataDir().then(() => {
  app.listen(PORT, () => {
    console.log(`Finch server running on http://localhost:${PORT}`);
  });
});
