# Kintara F12 API mapping (master list)

Analytics app policy: **read-only public GETs only**.  
Never integrate reserve / quote / buy / confirm / release / session cookies / private keys.

---

## A. Official marketplace (kintara.com) — confirmed

| # | Method | URL | Purpose | Auth | Kinfolio status |
|---|--------|-----|---------|------|-----------------|
| 1 | GET | `https://kintara.com/api/marketplace/listings` | Listings, prices, seller, qty, reservation | Public | **Live** via `/api/market/official/listings` |
| 2 | GET | `…/listings?sort=cheap&currency=token&category=all&limit=60&offset=0` | Cheapest KINS listings + pagination | Public | **Live** (same) |
| 3 | GET | `https://kintara.com/api/marketplace/stats?currency=token&itemType={ITEM_TYPE}` | 30d avg, daily prices, sales count | Public | **Live** via stats enrichment |
| 4 | POST | `https://kintara.com/api/marketplace/reserve` | Reserve listing before buy | Session | **Blocked** |
| 5 | POST | `https://kintara.com/api/marketplace/token-quote` | Purchase quote (`quoteId`, `signature`) | Session | **Blocked** |
| 6 | POST | `https://kintara.com/api/marketplace/token-buy-confirm` | Confirm purchase after wallet tx | Session | **Blocked** |
| 7 | POST | `https://kintara.com/api/marketplace/release-reserve` | Release reservation | Session | **Blocked** |

### Observed listings shape

```json
{
  "ok": true,
  "listings": [
    {
      "id": 956354,
      "sellerId": 30986,
      "sellerName": "…",
      "itemType": "wood",
      "quantity": 1611,
      "priceGold": 1,
      "currency": "token",
      "priceUsd": 0.03,
      "createdAt": "2026-07-15T02:59:00.814Z",
      "reservedBy": null,
      "reservedUntilMs": null,
      "itemDurability": null
    }
  ]
}
```

Notes:

- `priceUsd` is **lot total USD**, not unit. Unit USD = `priceUsd / quantity`.
- `itemType` query filter is **unreliable**; filter client-side after paginated fetch.
- Skip rows with `reservedBy` / active `reservedUntilMs`.

### Observed stats shape (matches original PRD fixture)

```json
{
  "ok": true,
  "currency": "token",
  "avg30d": 0.0002,
  "samples": [
    { "date": "2026-06-15", "avgUnitPrice": 0.0003, "sales": 533 }
  ]
}
```

`avgUnitPrice` / `avg30d` treated as **USD per unit** (same scale as market floors). Convert to KINS with ticker/DexScreener rate.

---

## B. Wallet / purchase plumbing — blocked or incomplete

| # | Method | URL | Purpose | Status | Kinfolio |
|---|--------|-----|---------|--------|----------|
| 8 | ? | `/auth/solana-json-rpc` | Solana RPC during marketplace actions | Partial — full host/payload TBD | **Blocked** |
| 9 | ? | `/token` | Seen in token-purchase flow | Partial | **Blocked** |

---

## C. World / economy (fanout + auth)

| # | Method | URL | Purpose | Auth | Kinfolio |
|---|--------|-----|---------|------|----------|
| 10 | GET | `https://fanout.kintara.gg/api/world/merchant-campaign` | Merchant cycle, donation pool | Public | **Live** `/api/world/merchant-campaign` |
| 11 | GET | `https://fanout.kintara.gg/api/world/expansion-tribute` | Expansion tribute progress | Public | **Live** `/api/world/expansion-tribute` |
| 12 | GET | `https://kintara.com/api/auth/merchant-cycle-status` | Player merchant cycle | **401 without session** | **Not used** (no cookies) |
| 13 | GET | `https://kintara.com/api/servers` | Server list / load | Public | **Live** `/api/world/servers` |
| 14 | GET | `https://fanout.kintara.gg/api/world/chat?after=0&region=world&shard=3` | World chat | Public | **Not integrated** (noise for portfolio) |

---

## D. Player-private / partial

| # | URL | Purpose | Status | Kinfolio |
|---|-----|---------|--------|----------|
| 15 | `/save-backpack` | Save backpack | Partial; 502 seen | **Blocked** |
| 16 | `GET https://kintara.com/api/friends/pending-count` | Friend requests | **401** | **Not used** |
| 24 | Player inventory/backpack API | Owned quantities | Needs auth capture | **Not used** |
| 25 | Claim-status API | Gold/merchant claim | Needs URL | **Not used** |
| 26 | Recent-orders API | Order history | Needs URL | **Not used** |

---

## E. Still missing exact official URLs (use community fallbacks)

| # | Purpose | Fallback in Kinfolio |
|---|---------|----------------------|
| 17 | Item catalog | Static seed + wiki sync + kintaramarket summary |
| 18 | Item details | Humanize `itemType` + stats |
| 19 | Active listings per item | kintaramarket `/api/market/{itemType}` + official cheap pages filtered |
| 20–22 | Sold history / recent sales / floor | kintrade recent-sales + gone; kintaramarket floors |
| 23 | Item image metadata | Fallbacks / wiki only for now |

---

## F. Community public APIs (already integrated)

| Source | Endpoints | Role |
|--------|-----------|------|
| kintaramarket.xyz | `/api/market`, `/api/market/{itemType}`, `/api/ticker` | Floors, per-item listings, KINS/gold rates |
| kintrade.xyz | `/api/recent-sales`, `/api/gone` | Completed sales, stale listing IDs |

---

## Integration rules

1. Sanitize captures: strip cookies, bearer tokens, signatures meant for signing.
2. Public GET only on production Vercel.
3. No client-controlled upstream URLs (SSRF).
4. Zod-validate every response.
5. Cache with short TTLs; show source + updated time.
6. Manual prices always work if APIs fail.

## Blocked write list (never implement)

```
POST /api/marketplace/reserve
POST /api/marketplace/token-quote
POST /api/marketplace/token-buy-confirm
POST /api/marketplace/release-reserve
/auth/solana-json-rpc
purchase /token flow
/save-backpack
any endpoint requiring personal Kintara session cookie
```
