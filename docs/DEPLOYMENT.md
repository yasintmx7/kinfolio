# Deployment (Vercel)

## 1. Push repository

```bash
cd kintara-portfolio
git remote add origin <your-repo>
git push -u origin main
```

## 2. Import on Vercel

- Framework preset: **Next.js**
- Build command: `npm run build`
- Output: default Next.js

## 3. Environment variables

| Name | Required | Notes |
|------|----------|--------|
| `NEXT_PUBLIC_APP_NAME` | No | Defaults to Kintara Portfolio |
| `NEXT_PUBLIC_KINS_MINT` | No | Defaults to configured mint — verify before prod |
| `COINGECKO_API_KEY` | No | Improves CoinGecko fallback reliability |
| `HELIUS_API_KEY` | No | Enables optional wallet balance/transfers |
| `KINTARA_PUBLIC_API_BASE` | No | Marketplace adapter base URL |
| `KINTARA_CATALOG_PATH` | No | After F12 mapping |
| `KINTARA_LISTINGS_PATH` | No | Supports `{itemId}` |
| `KINTARA_ITEM_STATS_PATH` | No | Supports `{itemId}` |
| `KINTARA_SOLD_HISTORY_PATH` | No | Supports `{itemId}` |
| `KINTARA_SESSION_COOKIE` | No | **Leaderboard only.** Full `Cookie` header from a logged-in kintara.com browser session. Server-side only. |
| `KINTARA_SESSION` | No | **Leaderboard only.** Alternate: session token alone (sent as `session=…`). |

Do **not** set private keys or seed phrases.  
`KINTARA_SESSION*` is optional and **only** used server-side for the kills leaderboard (official API is 401 without a game session). Never commit cookie values; refresh when they expire.

## 4. Verify

1. Open `/api/health`
2. Open `/api/price/kins`
3. Load dashboard — local data renders without APIs
4. Paste sample buy/sell alerts on `/add`
5. Export backup from Settings

## 5. Local

```bash
cp .env.example .env.local
npm install
npm run test
npm run dev
```
