import { createHash } from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../data');
const CACHE_FILE = join(DATA_DIR, 'insights-cache.json');

function cacheKey(statementIds) {
  const sorted = [...statementIds].sort().join(',');
  return createHash('sha256').update(sorted).digest('hex').slice(0, 16);
}

async function readCache() {
  try {
    return JSON.parse(await readFile(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeCache(cache) {
  try {
    await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch { /* non-fatal */ }
}

export async function getCachedInsights(statementIds) {
  const key = cacheKey(statementIds);
  const cache = await readCache();
  return cache[key] ?? null;
}

export async function setCachedInsights(statementIds, insights) {
  const key = cacheKey(statementIds);
  const cache = await readCache();
  cache[key] = { insights, generatedAt: new Date().toISOString() };
  await writeCache(cache);
}

export async function clearInsightsCache() {
  await writeCache({});
}
