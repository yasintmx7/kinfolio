# Kintara Portfolio

**Track trades, mining, inventory, and real profit.**

Community-built, local-first portfolio tool for Kintara players. Paste buy/sell transaction alerts, select item and quantity, and get deterministic KINS + USD accounting with weighted-average cost.

> Not affiliated with Kintara. Market values are estimates, not guaranteed sale prices.  
> No wallet signing, seed phrases, private keys, or personal game cookies.

## Features

- Alert parser (multi-line Sent/Received, fingerprints, duplicate warnings)
- Decimal-safe weighted-average cost engine (USD + KINS ledgers)
- Buy / sell / mined-earned entries with oversell protection
- Actual cost vs protected fee targets (display-only)
- IndexedDB persistence (Dexie) — per-browser portfolios
- Dashboard, inventory, mining, analytics, history, settings
- Live KINS price: DexScreener → CoinGecko → cache → manual
- Optional read-only Helius wallet routes
- Marketplace adapter slots (configure after F12 mapping)
- JSON backup import/export, CSV history export
- PWA manifest + production service worker
- Unit tests for parser + accounting acceptance cases

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run test      # Vitest unit tests
npm run build     # Production build
npm run lint
```

## Stack

Next.js App Router · TypeScript strict · Tailwind CSS · Dexie · Zod · decimal.js · Vitest

## Project layout

See `src/` for app routes, accounting engine (`src/lib/accounting`), parser (`src/lib/parser`), and API routes (`src/app/api`). Docs live in `docs/`.

## Security

- Portfolio math runs in the browser.
- Server APIs never accept client-controlled upstream URLs.
- Secrets are server-only (no `NEXT_PUBLIC_` for keys).

## Deploy

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Still needed for live marketplace prices

Exact public Kintara endpoint URLs after sanitized F12 capture — see [docs/KINTARA_F12_API_MAPPING.md](docs/KINTARA_F12_API_MAPPING.md).
