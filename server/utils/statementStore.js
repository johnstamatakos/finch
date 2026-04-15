import { readFile, writeFile, readdir, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { deriveStatementMeta } from './deriveStatementMeta.js';

// Always resolves to <repo-root>/data/statements regardless of CWD
const DATA_DIR = fileURLToPath(new URL('../../data/statements', import.meta.url));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateId(id) {
  if (!UUID_RE.test(id)) throw new Error('Invalid statement id.');
  return id;
}

export async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

export async function getAllFingerprints() {
  await ensureDataDir();
  const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith('.json'));
  const fingerprints = new Set();
  await Promise.all(
    files.map(async (f) => {
      try {
        const { transactions = [] } = JSON.parse(await readFile(join(DATA_DIR, f), 'utf8'));
        for (const t of transactions) {
          if (t.fingerprint) fingerprints.add(t.fingerprint);
        }
      } catch { /* skip unreadable files */ }
    })
  );
  return fingerprints;
}

export async function listStatements() {
  await ensureDataDir();
  const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith('.json'));
  const metas = await Promise.all(
    files.map(async (f) => {
      const raw = await readFile(join(DATA_DIR, f), 'utf8');
      const { transactions: _tx, ...meta } = JSON.parse(raw);
      return meta;
    })
  );
  return metas.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

export async function saveStatement({ name, monthlyIncome, transactions }) {
  await ensureDataDir();
  const id = randomUUID();
  const { period, summary } = deriveStatementMeta(transactions, monthlyIncome);
  const statement = {
    id,
    name,
    savedAt: new Date().toISOString(),
    monthlyIncome,
    period,
    summary,
    transactions,
  };
  await writeFile(join(DATA_DIR, `${id}.json`), JSON.stringify(statement, null, 2));
  return statement;
}

export async function getStatement(id) {
  validateId(id);
  await ensureDataDir();
  const path = join(DATA_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function updateStatement(id, { name, monthlyIncome, transactions }) {
  validateId(id);
  await ensureDataDir();
  const path = join(DATA_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  const existing = JSON.parse(await readFile(path, 'utf8'));
  const { period, summary } = deriveStatementMeta(transactions, monthlyIncome);
  const updated = {
    ...existing,
    name: name ?? existing.name,
    monthlyIncome: monthlyIncome ?? existing.monthlyIncome,
    transactions,
    period,
    summary,
  };
  await writeFile(path, JSON.stringify(updated, null, 2));
  return updated;
}

export async function deleteStatement(id) {
  validateId(id);
  await ensureDataDir();
  const path = join(DATA_DIR, `${id}.json`);
  if (!existsSync(path)) return false;
  await unlink(path);
  return true;
}
