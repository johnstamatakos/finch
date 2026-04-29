import { Router } from 'express';
import { getCategories, addCategory, renameCategory, deleteCategory } from '../utils/categoriesStore.js';
import { recategorizeAcrossAllStatements } from '../utils/statementStore.js';
import { clearInsightsCache } from '../utils/insightsCache.js';
import { asyncHandler } from '../utils/requestHelpers.js';

const router = Router();

router.get('/categories', asyncHandler(async (_req, res) => {
  return res.json(await getCategories());
}));

router.post('/categories', asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const added = await addCategory(name);
  if (!added) return res.status(409).json({ error: 'Category already exists.' });
  return res.status(201).json({ name: added });
}));

router.patch('/categories/:name', asyncHandler(async (req, res) => {
  const oldName = decodeURIComponent(req.params.name);
  const { newName } = req.body;
  if (!newName || typeof newName !== 'string') {
    return res.status(400).json({ error: 'newName (string) is required.' });
  }
  const result = await renameCategory(oldName, newName.trim());
  if (result === false) return res.status(404).json({ error: 'Category not found.' });
  if (result === null) return res.status(409).json({ error: 'Category name already exists.' });
  const { updatedCount, statementsAffected } = await recategorizeAcrossAllStatements(oldName, result);
  await clearInsightsCache();
  return res.json({ ok: true, name: result, updatedTransactionCount: updatedCount, statementsAffected });
}));

router.delete('/categories/:name', asyncHandler(async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!/^[\w\s\-&'.]+$/u.test(name)) {
    return res.status(400).json({ error: 'Invalid category name.' });
  }
  const deleted = await deleteCategory(name);
  if (!deleted) return res.status(404).json({ error: 'Category not found.' });
  return res.json({ ok: true });
}));

export default router;
