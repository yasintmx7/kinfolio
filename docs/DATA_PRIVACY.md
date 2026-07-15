# Data privacy

## Local by default

- Transactions, inventory cost basis, favorites, manual prices, wallet address preference, and backups live in **IndexedDB** in the visitor's browser.
- Clearing site data, using private mode incorrectly, or switching browsers can lose data. **Export JSON regularly.**

## Server

- `/api/price/*`, `/api/catalog/*`, `/api/market/*`, `/api/wallet/*` are read-only proxies/caches.
- No portfolio holdings are uploaded in the MVP.
- Secrets (`HELIUS_API_KEY`, `COINGECKO_API_KEY`) must be server-only (never `NEXT_PUBLIC_`).

## Never collected

- Seed phrases
- Private keys
- Kintara session cookies
- Wallet signatures for purchasing
