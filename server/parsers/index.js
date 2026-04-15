import { parseSpreadsheet } from './spreadsheetParser.js';

const SPREADSHEET_TYPES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const SPREADSHEET_EXTS = new Set(['csv', 'xlsx', 'xls']);

export function parseFile(buffer, mimetype, filename) {
  const ext = (filename || '').toLowerCase().split('.').pop();
  if (!SPREADSHEET_TYPES.has(mimetype) && !SPREADSHEET_EXTS.has(ext)) {
    throw new Error('Unsupported file type. Please upload a CSV or Excel spreadsheet (.csv, .xlsx, .xls).');
  }
  return parseSpreadsheet(buffer);
}
