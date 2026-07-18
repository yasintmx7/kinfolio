/**
 * Live verify All-items board data (kintaramarket.xyz).
 * Run: node scripts/verify-market-board.mjs
 */
const BASE = "https://kintaramarket.xyz";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const market = await fetch(`${BASE}/api/market`).then((r) => r.json());
assert(Array.isArray(market), "market must be array");
assert(market.length >= 50, `expected many items, got ${market.length}`);

let totalListings = 0;
let totalQty = 0;
for (const r of market) {
  totalListings += r.listings ?? 0;
  totalQty += r.totalQty ?? 0;
  assert(r.itemType, "itemType required");
  assert(typeof r.listings === "number", `listings for ${r.itemType}`);
}

// gold full list
const gold = await fetch(`${BASE}/api/market/gold`).then((r) => r.json());
assert(Array.isArray(gold) && gold.length > 10, "gold list incomplete");

const sample = gold[0];
assert(sample.quantity > 0, "qty");
assert(sample.unitPrice > 0 || sample.priceUsd > 0, "price");

// qty 3 style: unit should be lot/qty
const triple = gold.find((g) => g.quantity === 3 && g.priceUsd != null);
if (triple) {
  const unit = triple.unitPrice ?? triple.priceUsd / triple.quantity;
  const per1k = unit * 1000;
  assert(unit < 10, `gold unit should be small $, got ${unit}`);
  assert(per1k > unit, "per1k larger than unit");
  // Display rule: unit >= 0.01 → show /1 not /1k
  assert(unit >= 0.01, "gold unit typically >= 0.01 so UI uses /1");
  console.log("gold qty3 check", {
    qty: triple.quantity,
    lot: triple.priceUsd,
    unit,
    wrongPer1k: per1k,
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      items: market.length,
      totalListings,
      totalQty,
      top: market.slice(0, 5).map((r) => ({
        type: r.itemType,
        listings: r.listings,
        qty: r.totalQty,
        floor: r.lowestUsdPerUnit,
      })),
      goldLots: gold.length,
    },
    null,
    2,
  ),
);
