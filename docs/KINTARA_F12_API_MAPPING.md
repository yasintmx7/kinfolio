# Kintara market API mapping

Primary **read-only** public source (community site):

## kintaramarket.xyz

| Feature | HTTP method | Full URL | Public | Request | Headers | Response sample | Refresh | Normalizer |
|--------|-------------|---------|--------|---------|---------|-----------------|---------|------------|
| Ticker | GET | `https://kintaramarket.xyz/api/ticker` | Yes | — | Accept: json | `{ kinsUsd, goldFloorUsd }` | ~30s cache | **live** |
| Market summary | GET | `https://kintaramarket.xyz/api/market` | Yes | — | Accept: json | `{ itemType, listings, totalQty, lowestUsdPerUnit, lowestGoldPerUnit, kinsListings, goldListings }[]` | ~60s cache | **live** |
| Item listings | GET | `https://kintaramarket.xyz/api/market/{itemType}` | Yes | path `itemType` e.g. `stone` | Accept: json | `{ id, sellerName, quantity, currency, priceUsd, unitPrice, … }[]` | ~45s cache | **live** |
| Quote / buy | — | — | Auth write | — | — | — | — | **not integrated** |

### Ticker usage

- `kinsUsd` — preferred rate when converting market USD floors → KINS/unit.
- `goldFloorUsd` — gold market floor (display / future gold tools).
- App routes: `/api/price/ticker` (direct), also used by `/api/price/kins` (fallback after DexScreener) and `/api/market/items` conversion.

### Notes

- Floors are **USD per unit** (`lowestUsdPerUnit`, listing `unitPrice`).
- Portfolio valuation uses **KINS per unit** = `USD per unit ÷ KINS/USD` (DexScreener/CoinGecko).
- `currency: "token"` listings are KINS-side marketplace rows (USD quote still provided by the API).
- Gold listings are shown for reference only; cost basis remains KINS/USD from alerts.
- Active listings are **not** guaranteed sales.

### Env (defaults already set in code)

```dotenv
KINTARA_PUBLIC_API_BASE=https://kintaramarket.xyz
KINTARA_CATALOG_PATH=/api/market
KINTARA_LISTINGS_PATH=/api/market/{itemId}
KINTARA_ITEM_STATS_PATH=/api/market/{itemId}
```

### Item type ↔ portfolio catalog

See `src/lib/kintara/item-type-map.ts` for favorites mapping (`cooked_fish_meat` → `cooked-fish`, etc.).

## kintrade.xyz — completed sales

| Feature | HTTP method | Full URL | Public | Response | Normalizer |
|--------|-------------|---------|--------|----------|------------|
| Recent sales | GET | `https://www.kintrade.xyz/api/recent-sales` | Yes | `{ ok, sales: [{ itemType, quantity, kinsTotal, treasuryKins, usd, ts, signature, buyer, seller, … }] }` | **live** |

### Sales fields

- `kinsTotal` — buyer-paid KINS for the lot  
- `treasuryKins` — ~5% marketplace fee portion  
- `unitKins` (derived) = `kinsTotal / quantity`  
- `signature` — Solana tx (Solscan link)

App routes:

- `GET /api/market/recent-sales?itemType=&limit=`
- Enriches `GET /api/market/items/[itemId]/stats` with median recent sale KINS

### Intentionally blocked

Any quote/buy/reserve/sign flow (e.g. `{ quoteId, signature }`) is **not** integrated. This app is analytics only.
