# Accounting rules

## Method

- **Weighted-average cost** per item, dual ledgers: USD and KINS.
- Totals are always **recalculated** from transactions (pure functions). Cached summaries are disposable.

## Buy

- Sum every `Sent` line in an alert (fees/splits included).
- Increase quantity and add full USD/KINS totals to cost basis.
- Average = total basis / quantity.

## Sell

- `Received` is **net by default** (`sellAmountIsNet = true`). Do **not** deduct another 5%.
- Cost basis sold = (basis / qty) × qty sold.
- Realized profit = net received − cost basis sold.
- Oversell is rejected without mutation.

## Historical vs current

- Realized P/L uses USD/KINS stored on each alert at trade time.
- Never reprice old buys with today's KINS price.
- Unrealized value uses current KINS/USD × current item reference price × (1 − fee).

## Protected cost (display only)

- `simple_add`: actual × (1 + fee%)
- `exact_gross_up`: actual ÷ (1 − fee%)
- Never mixed into actual investment totals.

## Earned inventory

- mined / gathered / crafted / drop / reward / gift
- Quantity increases; purchase cost defaults to zero.
- Optional production expenses add to basis.
- Mixed bought + earned inventory shares one WAC pool.
