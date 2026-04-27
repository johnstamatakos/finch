import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// vi.mock is hoisted before imports — mocks are in place when index.js loads
vi.mock('../utils/statementStore.js', () => ({
  ensureDataDir: vi.fn().mockResolvedValue(undefined),
  listStatements: vi.fn(),
  saveStatement: vi.fn(),
  getStatement: vi.fn(),
  updateStatement: vi.fn(),
  deleteStatement: vi.fn(),
  patchStatement: vi.fn(),
  patchTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  deduplicateTransactions: vi.fn(),
  appendTransactions: vi.fn(),
  migrateFingerprints: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/categoriesStore.js', () => ({
  getCategories: vi.fn(),
  addCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

vi.mock('../utils/rulesStore.js', () => ({
  applyRules: vi.fn(),
  getRules: vi.fn(),
  setRule: vi.fn(),
  deleteRule: vi.fn(),
}));

vi.mock('../utils/plaidStore.js', () => ({
  getPlaidConfig: vi.fn(),
  savePlaidConfig: vi.fn(),
  hasPlaidConfig: vi.fn(),
}));

vi.mock('../utils/insightsCache.js', () => ({
  getCachedInsights: vi.fn(),
  setCachedInsights: vi.fn(),
  clearInsightsCache: vi.fn(),
}));

vi.mock('../ai/transactionAnalyzer.js', () => ({
  analyzeTransactions: vi.fn(),
}));

vi.mock('../ai/insightsAnalyzer.js', () => ({
  generateInsights: vi.fn(),
}));

vi.mock('../ai/rulesRefiner.js', () => ({
  refineRules: vi.fn(),
}));

vi.mock('../parsers/index.js', () => ({
  parseFile: vi.fn(),
}));

vi.mock('../utils/normalizeTransactions.js', () => ({
  normalizeTransactions: vi.fn(),
}));

vi.mock('../plaid/plaidClient.js', () => ({
  plaidClient: {
    linkTokenCreate: vi.fn(),
    itemPublicTokenExchange: vi.fn(),
    transactionsSync: vi.fn(),
  },
}));

import { app } from '../index.js';
import * as statementStore from '../utils/statementStore.js';
import * as categoriesStore from '../utils/categoriesStore.js';
import * as rulesStore from '../utils/rulesStore.js';
import * as plaidStore from '../utils/plaidStore.js';
import * as insightsCache from '../utils/insightsCache.js';
import { plaidClient } from '../plaid/plaidClient.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Common defaults required by most routes
  categoriesStore.getCategories.mockResolvedValue([]);
  insightsCache.clearInsightsCache.mockResolvedValue(undefined);
  insightsCache.getCachedInsights.mockResolvedValue(null);
  insightsCache.setCachedInsights.mockResolvedValue(undefined);
  plaidStore.savePlaidConfig.mockResolvedValue(undefined);
});

// ── Statements ────────────────────────────────────────────────────────────────

describe('GET /api/statements', () => {
  it('returns list of statements', async () => {
    const stmts = [{ id: '1', name: 'Jan 2024' }];
    statementStore.listStatements.mockResolvedValue(stmts);

    const res = await request(app).get('/api/statements');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(stmts);
  });

  it('propagates store errors through asyncHandler as 500', async () => {
    statementStore.listStatements.mockRejectedValue(new Error('disk read error'));

    const res = await request(app).get('/api/statements');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('disk read error');
  });
});

describe('POST /api/statements', () => {
  it('saves a new statement and returns 201', async () => {
    const txns = [{ id: 't1', description: 'Starbucks', amount: -5, fingerprint: 'abc' }];
    statementStore.deduplicateTransactions.mockResolvedValue({ unique: txns, duplicateCount: 0 });
    statementStore.saveStatement.mockResolvedValue({ id: 's1', name: 'Jan 2024', transactions: txns });

    const res = await request(app)
      .post('/api/statements')
      .send({ name: 'Jan 2024', monthlyIncome: 5000, transactions: txns });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Jan 2024');
    expect(res.body.duplicateCount).toBe(0);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/statements')
      .send({ transactions: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/);
  });

  it('returns 409 when all transactions are duplicates', async () => {
    statementStore.deduplicateTransactions.mockResolvedValue({ unique: [], duplicateCount: 3 });

    const res = await request(app)
      .post('/api/statements')
      .send({ name: 'Jan 2024', transactions: [{}] });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exist/);
  });
});

describe('GET /api/statements/:id', () => {
  it('returns a statement with its transactions', async () => {
    const stmt = { id: 'abc123', name: 'Feb 2024', transactions: [] };
    statementStore.getStatement.mockResolvedValue(stmt);

    const res = await request(app).get('/api/statements/abc123');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('abc123');
  });

  it('returns 404 for unknown id', async () => {
    statementStore.getStatement.mockResolvedValue(null);

    const res = await request(app).get('/api/statements/notfound');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 400 when store throws invalid id error', async () => {
    statementStore.getStatement.mockRejectedValue(new Error('Invalid statement id.'));

    const res = await request(app).get('/api/statements/bad-id');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid statement id.');
  });
});

// ── Categories ────────────────────────────────────────────────────────────────

describe('GET /api/categories', () => {
  it('returns the custom category list', async () => {
    categoriesStore.getCategories.mockResolvedValue(['Pets', 'Gas', 'Health']);

    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(['Pets', 'Gas', 'Health']);
  });
});

describe('POST /api/categories', () => {
  it('creates a new category and returns 201', async () => {
    categoriesStore.addCategory.mockResolvedValue('Pets');

    const res = await request(app).post('/api/categories').send({ name: 'Pets' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Pets');
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/categories').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/);
  });

  it('returns 409 when category already exists', async () => {
    categoriesStore.addCategory.mockResolvedValue(null);

    const res = await request(app).post('/api/categories').send({ name: 'Pets' });

    expect(res.status).toBe(409);
  });
});

// ── Rules ─────────────────────────────────────────────────────────────────────

describe('POST /api/rules', () => {
  it('creates a rule and returns ok', async () => {
    rulesStore.setRule.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/rules')
      .send({ merchant: 'Starbucks', category: 'Restaurants', isRecurring: false });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 400 when merchant or category is missing', async () => {
    const res = await request(app).post('/api/rules').send({ merchant: 'Starbucks' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/merchant/);
  });
});

describe('DELETE /api/rules/:key', () => {
  it('deletes an existing rule', async () => {
    rulesStore.deleteRule.mockResolvedValue(true);

    const res = await request(app).delete('/api/rules/Starbucks');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 404 for unknown rule key', async () => {
    rulesStore.deleteRule.mockResolvedValue(false);

    const res = await request(app).delete('/api/rules/Unknown%20Merchant');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// ── Plaid ─────────────────────────────────────────────────────────────────────

describe('GET /api/plaid/status', () => {
  it('returns connected true when account is linked', async () => {
    plaidStore.hasPlaidConfig.mockResolvedValue(true);

    const res = await request(app).get('/api/plaid/status');

    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
  });

  it('returns connected false when no account is linked', async () => {
    plaidStore.hasPlaidConfig.mockResolvedValue(false);

    const res = await request(app).get('/api/plaid/status');

    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
  });
});

describe('POST /api/plaid/sync', () => {
  it('returns 400 when no bank account is connected', async () => {
    plaidStore.getPlaidConfig.mockResolvedValue({ accessToken: null });

    const res = await request(app).post('/api/plaid/sync');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No bank account/);
  });

  it('returns 500 with a safe message when the Plaid API fails', async () => {
    plaidStore.getPlaidConfig.mockResolvedValue({ accessToken: 'access-tok', cursor: null });
    plaidClient.transactionsSync.mockRejectedValue(
      Object.assign(new Error('PLAID_ERROR'), {
        response: { data: { error_code: 'ITEM_LOGIN_REQUIRED' } },
      })
    );

    const res = await request(app).post('/api/plaid/sync');

    expect(res.status).toBe(500);
    // Should NOT leak the raw Plaid error
    expect(res.body.error).toBe('Sync failed. Please try again.');
  });
});
