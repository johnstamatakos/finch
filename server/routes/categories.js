import { Router } from 'express';
import { getCategories, addCategory, deleteCategory } from '../utils/categoriesStore.js';
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
