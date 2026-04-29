import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const CATEGORIES_PATH = fileURLToPath(new URL('../../data/categories.json', import.meta.url));

async function load() {
  try {
    if (!existsSync(CATEGORIES_PATH)) return [];
    return JSON.parse(await readFile(CATEGORIES_PATH, 'utf8'));
  } catch {
    return [];
  }
}

async function save(categories) {
  await writeFile(CATEGORIES_PATH, JSON.stringify(categories, null, 2));
}

export async function getCategories() {
  return load();
}

export async function addCategory(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const categories = await load();
  if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return null;
  categories.push(trimmed);
  await save(categories);
  return trimmed;
}

export async function renameCategory(oldName, newName) {
  const trimmed = newName.trim();
  if (!trimmed) return null;
  const categories = await load();
  const idx = categories.findIndex((c) => c.toLowerCase() === oldName.toLowerCase());
  if (idx === -1) return false;
  if (categories.some((c, i) => i !== idx && c.toLowerCase() === trimmed.toLowerCase())) return null;
  categories[idx] = trimmed;
  await save(categories);
  return trimmed;
}

export async function deleteCategory(name) {
  const categories = await load();
  const idx = categories.findIndex((c) => c.toLowerCase() === name.toLowerCase());
  if (idx === -1) return false;
  categories.splice(idx, 1);
  await save(categories);
  return true;
}
