import { Router } from 'express';
import {
  listStatements,
  saveStatement,
  getStatement,
  updateStatement,
  deleteStatement,
  patchStatement,
  patchTransaction,
  deleteTransaction,
  appendTransactions,
  deduplicateTransactions,
  bulkPatchTransactions,
} from '../utils/statementStore.js';
import { clearInsightsCache } from '../utils/insightsCache.js';
import { asyncHandler } from '../utils/requestHelpers.js';

const router = Router();

router.get('/statements', asyncHandler(async (_req, res) => {
  return res.json(await listStatements());
}));

router.post('/statements', asyncHandler(async (req, res) => {
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

router.get('/statements/:id', asyncHandler(async (req, res) => {
  const statement = await getStatement(req.params.id);
  if (!statement) return res.status(404).json({ error: 'Statement not found.' });
  return res.json(statement);
}));

router.put('/statements/:id', asyncHandler(async (req, res) => {
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

// Must be before /statements/:id to avoid route shadowing
router.patch('/statements/bulk-recategorize', asyncHandler(async (req, res) => {
  const { updates } = req.body;
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'updates array is required.' });
  }
  const { updatedCount } = await bulkPatchTransactions(updates);
  await clearInsightsCache();
  return res.json({ ok: true, updatedCount });
}));

router.patch('/statements/:id', asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name (string) is required.' });
  }
  const updated = await patchStatement(req.params.id, { name: name.trim() });
  if (!updated) return res.status(404).json({ error: 'Statement not found.' });
  const { transactions: _tx, ...meta } = updated;
  return res.json(meta);
}));

router.delete('/statements/:id', asyncHandler(async (req, res) => {
  const deleted = await deleteStatement(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Statement not found.' });
  await clearInsightsCache();
  return res.json({ ok: true });
}));

router.post('/statements/:id/append', asyncHandler(async (req, res) => {
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

router.delete('/statements/:stmtId/transactions/:txId', asyncHandler(async (req, res) => {
  const { stmtId, txId } = req.params;
  const result = await deleteTransaction(stmtId, txId);
  if (!result) return res.status(404).json({ error: 'Statement or transaction not found.' });
  await clearInsightsCache();
  return res.json({ ok: true });
}));

router.patch('/statements/:stmtId/transactions/:txId', asyncHandler(async (req, res) => {
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
  await clearInsightsCache();
  return res.json(tx);
}));

export default router;
