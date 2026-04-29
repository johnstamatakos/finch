import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { ensureDataDir, migrateFingerprints } from './utils/statementStore.js';

import analyzeRouter from './routes/analyze.js';
import statementsRouter from './routes/statements.js';
import rulesRouter from './routes/rules.js';
import categoriesRouter from './routes/categories.js';
import insightsRouter from './routes/insights.js';
import plaidRouter from './routes/plaid.js';

const app = express();
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));
app.use(express.json());

app.use('/api', analyzeRouter);
app.use('/api', statementsRouter);
app.use('/api', rulesRouter);
app.use('/api', categoriesRouter);
app.use('/api', insightsRouter);
app.use('/api', plaidRouter);

app.use((err, _req, res, _next) => {
  if (err.message === 'Invalid statement id.') {
    return res.status(400).json({ error: err.message });
  }
  console.error(`[${err.name || 'Error'}]`, err.message);
  res.status(err.status || 500).json({ error: err.message });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT || 3001;
  ensureDataDir()
    .then(migrateFingerprints)
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Finch server running on http://localhost:${PORT}`);
      });
    });
}

export { app };
