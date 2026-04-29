import { Router } from 'express';
import { parseFile } from '../parsers/index.js';
import { analyzeTransactions } from '../ai/transactionAnalyzer.js';
import { normalizeTransactions } from '../utils/normalizeTransactions.js';
import { applyRules } from '../utils/rulesStore.js';
import { deduplicateTransactions } from '../utils/statementStore.js';
import { getCategories } from '../utils/categoriesStore.js';
import { asyncHandler, upload } from '../utils/requestHelpers.js';

const router = Router();

router.post('/analyze', upload.single('file'), asyncHandler(async (req, res) => {
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

export default router;
