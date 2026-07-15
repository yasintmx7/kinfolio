# Kintara F12 API mapping

Do **not** invent endpoints. Paste sanitized DevTools captures here, then wire `src/config/kintara-api.ts`.

## Rules

1. Remove cookies, bearer tokens, wallet signatures, and personal identifiers.
2. Confirm the endpoint is safely public (no personal session cookie).
3. Add path templates via env: `KINTARA_*_PATH`.
4. Add Zod schema + normalizer tests with sanitized fixtures.
5. Call only from server Route Handlers.
6. Never integrate quote / buy / reserve / sign / claim.

## Mapping table

| Feature | HTTP method | Full URL | Public or authenticated | Request query/body | Required headers | Sanitized response sample | Refresh behavior | Rate limit observed | Normalizer status |
|--------|-------------|---------|-------------------------|--------------------|------------------|---------------------------|------------------|---------------------|-------------------|
| Catalog | GET | _TBD_ | Public? | | | | | | pending |
| Active listings | GET | _TBD_ | Public? | `{itemId}` | | | | | pending |
| Item stats | GET | _TBD_ | Public? | `{itemId}` | | `{ ok, currency, avg30d, samples[] }` | | | partial (shape ready) |
| Sold history | GET | _TBD_ | Public? | `{itemId}` | | `{ date, avgUnitPrice, sales }` | | | partial |
| Quote (DO NOT USE) | — | — | Authenticated write | | | `{ quoteId, signature }` | — | — | **blocked by design** |

## Known response fragments (normalizer support)

```json
{
  "ok": true,
  "currency": "token",
  "avg30d": 0.0002,
  "samples": [
    {
      "date": "2026-06-05",
      "avgUnitPrice": 0.0002,
      "sales": 91
    }
  ]
}
```

Quote-shaped responses are **write/purchase flow and intentionally not integrated**.

## Env slots

```dotenv
KINTARA_PUBLIC_API_BASE=
KINTARA_CATALOG_PATH=
KINTARA_LISTINGS_PATH=
KINTARA_ITEM_STATS_PATH=
KINTARA_SOLD_HISTORY_PATH=
```

Path templates may include `{itemId}`.
