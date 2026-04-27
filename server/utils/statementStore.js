import { readFile, writeFile, readdir, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { randomUUID, createHash } from 'crypto';
import { deriveStatementMeta } from './deriveStatementMeta.js';
import { normalizeMerchantKey } from './rulesStore.js';

function recomputeFingerprint(date, description, amount) {
  const key = `${date}|${normalizeMerchantKey(description)}|${amount}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

// Use a separate directory for sandbox testing so fake data never touches real statements
const dataSubdir = process.env.PLAID_ENV === 'sandbox' ? 'sandbox-statements' : 'statements';
const DATA_DIR = fileURLToPath(new URL(`../../data/${dataSubdir}`, import.meta.url));

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

/**
 * Filter out transactions that already exist in any saved statement.
 * Returns { unique, duplicateCount }.
 */
export async function deduplicateTransactions(transactions) {
  const existing = await getAllFingerprints();
  const unique = transactions.filter((t) => !existing.has(t.fingerprint));
  return { unique, duplicateCount: transactions.length - unique.length };
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

/**
 * Patch top-level metadata on a statement (e.g. name).
 * Does NOT recalculate summary — suitable for non-financial fields.
 */
export async function patchStatement(id, patch) {
  validateId(id);
  await ensureDataDir();
  const path = join(DATA_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  const stmt = JSON.parse(await readFile(path, 'utf8'));
  const ALLOWED = ['name']; // whitelist patchable fields
  const updates = {};
  for (const key of ALLOWED) {
    if (patch[key] !== undefined) updates[key] = patch[key];
  }
  const updated = { ...stmt, ...updates };
  await writeFile(path, JSON.stringify(updated, null, 2));
  return updated;
}

/**
 * Patch individual fields on a single transaction (e.g. flagged, category).
 * Recalculates statement summary when financial fields change.
 */
export async function patchTransaction(stmtId, txId, patch) {
  validateId(stmtId);
  await ensureDataDir();
  const path = join(DATA_DIR, `${stmtId}.json`);
  if (!existsSync(path)) return null;
  const stmt = JSON.parse(await readFile(path, 'utf8'));
  let updated = null;
  const transactions = stmt.transactions.map((t) => {
    if (t.id === txId) { updated = { ...t, ...patch }; return updated; }
    return t;
  });
  if (!updated) return null;
  const FINANCIAL_FIELDS = ['category', 'amount', 'isDeposit'];
  const needsSummaryUpdate = FINANCIAL_FIELDS.some((f) => f in patch);
  const { period, summary } = needsSummaryUpdate
    ? deriveStatementMeta(transactions, stmt.monthlyIncome)
    : { period: stmt.period, summary: stmt.summary };
  await writeFile(path, JSON.stringify({ ...stmt, transactions, period, summary }, null, 2));
  return updated;
}

export async function deleteTransaction(stmtId, txId) {
  validateId(stmtId);
  await ensureDataDir();
  const path = join(DATA_DIR, `${stmtId}.json`);
  if (!existsSync(path)) return null;
  const stmt = JSON.parse(await readFile(path, 'utf8'));
  const before = stmt.transactions.length;
  const transactions = stmt.transactions.filter((t) => t.id !== txId);
  if (transactions.length === before) return null; // not found
  const { period, summary } = deriveStatementMeta(transactions, stmt.monthlyIncome);
  const updated = { ...stmt, transactions, period, summary };
  await writeFile(path, JSON.stringify(updated, null, 2));
  return true;
}

/**
 * Append new transactions to an existing statement.
 * Deduplicates by fingerprint before merging.
 * Recalculates summary after merge.
 */
export async function appendTransactions(id, newTransactions) {
  validateId(id);
  await ensureDataDir();
  const path = join(DATA_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  const stmt = JSON.parse(await readFile(path, 'utf8'));

  const existingFps = new Set(stmt.transactions.map((t) => t.fingerprint));
  const unique = newTransactions.filter((t) => !existingFps.has(t.fingerprint));
  if (unique.length === 0) return { ...stmt, appendedCount: 0 };

  const transactions = [...stmt.transactions, ...unique];
  const { period, summary } = deriveStatementMeta(transactions, stmt.monthlyIncome);
  const updated = { ...stmt, transactions, period, summary };
  await writeFile(path, JSON.stringify(updated, null, 2));
  return { ...updated, appendedCount: unique.length };
}

export async function deleteStatement(id) {
  validateId(id);
  await ensureDataDir();
  const path = join(DATA_DIR, `${id}.json`);
  if (!existsSync(path)) return false;
  await unlink(path);
  return true;
}

/**
 * One-time migration: recompute all transaction fingerprints using the
 * normalized merchant key so that CSV-uploaded and Plaid-synced transactions
 * for the same merchant produce the same fingerprint and dedup correctly.
 */
export async function migrateFingerprints() {
  await ensureDataDir();
  const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith('.json'));
  let totalUpdated = 0;
  for (const f of files) {
    const path = join(DATA_DIR, f);
    try {
      const stmt = JSON.parse(await readFile(path, 'utf8'));
      let changed = false;
      const transactions = stmt.transactions.map((t) => {
        const newFp = recomputeFingerprint(t.date, t.description, t.amount);
        if (newFp === t.fingerprint) return t;
        changed = true;
        totalUpdated++;
        return { ...t, fingerprint: newFp };
      });
      if (changed) {
        await writeFile(path, JSON.stringify({ ...stmt, transactions }, null, 2));
      }
    } catch { /* skip unreadable files */ }
  }
  if (totalUpdated > 0) {
    console.log(`[migration] Re-fingerprinted ${totalUpdated} transactions across ${files.length} statements.`);
  }
}
