import { describe, expect, it } from "vitest";
import { findKinTradeMatch } from "@/lib/market/sold-buyer-match";

describe("findKinTradeMatch", () => {
  const base = {
    ts: 1_000_000,
    itemType: "wood",
    qty: "5000",
    usd: "0.05",
    signature: "sig-abc-def-ghi-jkl-mno-pqr-stu-vwx",
    buyer: "BahW3Bt1XdVsUWrRSere59Rd9kA4pnJ4ZwmuDLdSYYTb",
    seller: "DuX2jtGTVAyjuL4Lcuwnyz4f5V3uTSeJFe7hH89PxFJV",
    listingId: "1060442",
    hasItem: true,
    name: "Wood",
    unitUsd: "0.00001",
    kinsTotal: "10",
    unitKins: "0.002",
    id: "kt-1",
  };

  it("matches same item/qty near in time and returns buyer wallet row", () => {
    const hit = findKinTradeMatch(
      [base],
      1_000_000 + 8_000,
      "wood",
      5000,
      0.05,
    );
    expect(hit?.id).toBe("kt-1");
    expect(hit?.buyer).toBe(base.buyer);
    expect(hit?.listingId).toBe("1060442");
  });

  it("rejects wrong item", () => {
    const hit = findKinTradeMatch([base], 1_000_000, "stone", 5000, 0.05);
    expect(hit).toBeNull();
  });

  it("allows incomplete row with tight USD", () => {
    const incomplete = {
      ...base,
      hasItem: false,
      itemType: "unknown",
      qty: "?",
      id: "kt-bare",
    };
    const hit = findKinTradeMatch(
      [incomplete],
      1_000_000 + 5_000,
      "wood",
      5000,
      0.05,
    );
    expect(hit?.id).toBe("kt-bare");
  });
});
