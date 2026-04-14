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
} from './utils/statementStore.js';

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
    const transactions = normalizeTransactions(rawTransactions);

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
    const statement = await saveStatement({ name, monthlyIncome: monthlyIncome || 0, transactions });
    const { transactions: _tx, ...meta } = statement;
    return res.status(201).json(meta);
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
    return res.json({ ok: true });
  } catch (err) {
    if (err.message === 'Invalid statement id.') return res.status(400).json({ error: err.message });
    console.error('Error in DELETE /api/statements/:id:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
ensureDataDir().then(() => {
  app.listen(PORT, () => {
    console.log(`Budget Buddy server running on http://localhost:${PORT}`);
  });
});
