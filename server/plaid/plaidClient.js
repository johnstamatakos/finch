import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const clientId = process.env.PLAID_CLIENT_ID;
const secret = process.env.PLAID_SECRET;
const env = process.env.PLAID_ENV || 'sandbox';

if (!clientId || !secret) {
  console.warn('[Plaid] PLAID_CLIENT_ID or PLAID_SECRET not set — bank sync will be unavailable.');
}

const config = new Configuration({
  basePath: PlaidEnvironments[env],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': clientId,
      'PLAID-SECRET': secret,
    },
  },
});

export const plaidClient = new PlaidApi(config);
