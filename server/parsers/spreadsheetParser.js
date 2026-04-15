import * as XLSX from 'xlsx';

// Column name keyword lists (lowercase, word-based)
const DATE_KEYS     = ['date', 'posted date', 'post date', 'transaction date', 'trans date', 'value date', 'activity date'];
const SOURCE_KEYS   = ['description', 'merchant', 'payee', 'memo', 'name', 'narrative', 'details',
                       'trans description', 'particulars', 'reference'];
const ACTIVITY_KEYS = ['activity', 'type', 'transaction type', 'trans type'];
const AMOUNT_KEYS   = ['amount', 'transaction amount'];
const DEBIT_KEYS    = ['debit', 'withdrawal', 'withdrawals', 'debit amount'];
const CREDIT_KEYS   = ['credit', 'deposit', 'deposits', 'credit amount'];

/** Normalize a column name to a list of lowercase words, stripping punctuation */
function toWords(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
}

/**
 * Returns true if every word in the keyword phrase appears in the header's word list.
 * e.g. matches('Transaction Date', ['date']) → true  (word 'date' is present)
 *      matches('Activity',          ['activity']) → true  (exact word match)
 *      matches('Activity Date',     ['activity']) → true but dateCol is checked first,
 *      so 'Activity Date' is consumed by DATE_KEYS before ACTIVITY_KEYS is reached.
 */
function matches(header, keys) {
  const hWords = toWords(header);
  return keys.some((k) => {
    const kWords = toWords(k);
    return kWords.every((kw) => hWords.includes(kw));
  });
}

function normalizeDate(val) {
  if (val == null || val === '') return '';
  if (val instanceof Date) return isNaN(val) ? '' : val.toISOString().slice(0, 10);
  const s = String(val).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function parseAmount(val) {
  if (val === '' || val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  const s = String(val).replace(/[$,\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// All recognized keywords combined — used to identify the real header row
const ALL_KEYS = [
  ...DATE_KEYS, ...SOURCE_KEYS, ...ACTIVITY_KEYS,
  ...AMOUNT_KEYS, ...DEBIT_KEYS, ...CREDIT_KEYS,
];

/** Scan raw rows (2-D array) to find the row index that looks like real column headers */
function findHeaderRow(raw) {
  for (let i = 0; i < Math.min(raw.length, 30); i++) {
    const cells = raw[i].map((c) => String(c).toLowerCase().trim());
    const hits = cells.filter((cell) =>
      ALL_KEYS.some((k) => cell === k || cell.includes(k))
    );
    if (hits.length >= 2) return i;
  }
  return 0; // fall back to first row
}

export function parseSpreadsheet(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const allRows = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];

    // Get raw 2-D array so we can detect where the real headers start
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    if (raw.length === 0) continue;

    const headerRowIdx = findHeaderRow(raw);
    const headerCells  = raw[headerRowIdx].map((c) => String(c).trim());

    // Build objects from data rows below the header
    for (const rawRow of raw.slice(headerRowIdx + 1)) {
      // Skip completely empty rows
      if (!rawRow.some((c) => c !== '' && c !== null && c !== undefined)) continue;
      const obj = {};
      headerCells.forEach((h, i) => {
        obj[h || `__COL_${i}`] = rawRow[i] ?? '';
      });
      allRows.push(obj);
    }
  }

  if (allRows.length === 0) {
    throw new Error('No data found in the spreadsheet.');
  }

  const headers = Object.keys(allRows[0]);
  console.log('[spreadsheet] headers:', headers);
  console.log('[spreadsheet] sample row:', allRows[0]);

  // Detect columns by matching header names against keyword lists
  let dateCol = null, sourceCol = null, activityCol = null;
  let amountCol = null, debitCol = null, creditCol = null;

  for (const h of headers) {
    if (!dateCol     && matches(h, DATE_KEYS))     { dateCol     = h; continue; }
    if (!sourceCol   && matches(h, SOURCE_KEYS))   { sourceCol   = h; continue; }
    if (!activityCol && matches(h, ACTIVITY_KEYS)) { activityCol = h; continue; }
    if (!amountCol   && matches(h, AMOUNT_KEYS))   { amountCol   = h; continue; }
    if (!debitCol    && matches(h, DEBIT_KEYS))    { debitCol    = h; continue; }
    if (!creditCol   && matches(h, CREDIT_KEYS))   { creditCol   = h; continue; }
  }

  console.log('[spreadsheet] detected →', { dateCol, sourceCol, activityCol, amountCol, debitCol, creditCol });

  // Fallback: pick the longest-text column as source
  if (!sourceCol) {
    const sample = allRows.slice(0, 20);
    const best = headers
      .filter((h) => sample.some((r) => {
        const v = String(r[h] || '');
        return v.length > 3 && isNaN(parseFloat(v));
      }))
      .sort((a, b) => {
        const lenA = sample.reduce((s, r) => s + String(r[a] || '').length, 0);
        const lenB = sample.reduce((s, r) => s + String(r[b] || '').length, 0);
        return lenB - lenA;
      });
    sourceCol = best[0] || headers[1];
    console.log('[spreadsheet] sourceCol fallback →', sourceCol);
  }

  const transactions = [];

  for (const row of allRows.slice(0, 1000)) {
    const source = String(row[sourceCol] || '').trim();
    if (!source) continue;

    const date = normalizeDate(row[dateCol]);

    // Resolve amount
    let amount = null;
    if (amountCol) {
      amount = parseAmount(row[amountCol]);
    } else if (debitCol || creditCol) {
      const debit  = parseAmount(row[debitCol])  ?? 0;
      const credit = parseAmount(row[creditCol]) ?? 0;
      if (credit > 0)     amount =  credit;
      else if (debit > 0) amount = -debit;
      else                amount =  0;
    }

    if (amount === null) continue;

    const activity = activityCol ? String(row[activityCol] || '').trim() : '';

    transactions.push({ date, source, activity, amount });
  }

  if (transactions.length === 0) {
    throw new Error('No transactions could be extracted. Check that the file has date and amount columns.');
  }

  return transactions;
}
