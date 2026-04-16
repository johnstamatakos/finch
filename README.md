<div align="center">
  <img width="512" height="280" alt="logo" src="https://github.com/user-attachments/assets/46c9e1e7-3f2e-4ada-94ab-e35fcb008a63" />
</div>

# Finch

A personal finance dashboard that connects to your bank via Plaid, categorizes transactions with AI, and gives you a clear picture of where your money goes.

<img width="2553" height="1281" alt="image" src="https://github.com/user-attachments/assets/d5c82f60-17cd-4fd2-a65e-0ff623af16c4" />


## What it does

- **Bank sync** — connects to your bank via Plaid and pulls in new transactions automatically
- **AI categorization** — Claude categorizes every transaction on import; you can override and save rules
- **Rules engine** — save merchant→category mappings so recurring transactions are always pre-categorized
- **Dashboard** — spending by category, monthly trends, top merchants, recurring vs one-time, daily spend patterns, and savings rate
- **Transactions view** — searchable, filterable table with inline category editing, flagging, and deletion
- **CSV/PDF upload** — manual import as an alternative to bank sync
- **Insights** — AI-generated summary of your spending patterns

## Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **AI**: Anthropic Claude (Haiku for categorization, Sonnet for insights)
- **Bank sync**: Plaid

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/johnstamatakos/finch.git
cd finch
npm install
cd server && npm install && cd ..
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

```
ANTHROPIC_API_KEY=   # from console.anthropic.com
PLAID_CLIENT_ID=     # from dashboard.plaid.com
PLAID_SECRET=        # sandbox or production secret
PLAID_ENV=sandbox    # sandbox | production
PORT=3001
```

### 3. Run

In two terminals:

```bash
# Terminal 1 — backend
npm run server:dev

# Terminal 2 — frontend
npm run dev
```

Open `http://localhost:5173`.

---

## Environments

`PLAID_ENV` controls which data directory and rules file the server uses:

| `PLAID_ENV` | Statements | Rules |
|---|---|---|
| `sandbox` | `data/sandbox-statements/` | `data/sandbox-rules.json` |
| `production` | `data/statements/` | `data/rules.json` |

Switching between environments just requires changing `PLAID_ENV` in `.env` and restarting the server. Your real data is never touched while in sandbox mode.

### Sandbox testing

Use Plaid's test credentials when prompted in the Link flow:
- Username: `user_good`
- Password: `pass_good`

---

## Data

All data is stored locally in `data/` (gitignored). Nothing is sent to any server other than Anthropic (for AI) and Plaid (for bank sync).

```
data/
  statements/          # production statement JSON files
  sandbox-statements/  # sandbox test data
  rules.json           # production categorization rules
  sandbox-rules.json   # sandbox rules
  plaid-config.json    # Plaid access token + sync cursor
```
