import { describe, expect, it } from "vitest";
import {
  formatSellerLabel,
  isSolanaAddress,
  officialListingId,
  sanitizePersonName,
  shortWallet,
} from "@/lib/market/seller-label";

describe("seller-label", () => {
  it("detects solana addresses", () => {
    expect(
      isSolanaAddress("7fauE6LpwpmMPjeqbcuJY6RM6WyJwEQrKPBiYxHMV3GH"),
    ).toBe(true);
    expect(isSolanaAddress("Oreymorey")).toBe(false);
    expect(isSolanaAddress("#33973")).toBe(false);
  });

  it("never returns wallet as person name", () => {
    expect(
      sanitizePersonName("7fauE6LpwpmMPjeqbcuJY6RM6WyJwEQrKPBiYxHMV3GH"),
    ).toBeNull();
    expect(sanitizePersonName("Oreymorey")).toBe("Oreymorey");
    expect(sanitizePersonName("7fau…V3GH")).toBeNull();
  });

  it("formats seller label name → #id → short wallet", () => {
    expect(
      formatSellerLabel({
        sellerName: "7fauE6LpwpmMPjeqbcuJY6RM6WyJwEQrKPBiYxHMV3GH",
        sellerId: "42",
      }),
    ).toBe("#42");
    expect(
      formatSellerLabel({
        sellerName: "Mozzart",
        sellerId: "1",
      }),
    ).toBe("Mozzart");
    expect(
      formatSellerLabel({
        sellerWallet: "7fauE6LpwpmMPjeqbcuJY6RM6WyJwEQrKPBiYxHMV3GH",
      }),
    ).toBe(shortWallet("7fauE6LpwpmMPjeqbcuJY6RM6WyJwEQrKPBiYxHMV3GH"));
  });

  it("only accepts numeric official listing ids", () => {
    expect(officialListingId(956354)).toBe("956354");
    expect(officialListingId("kh72se1xjnxk338bahyermmeps8ajbs2")).toBeNull();
    expect(officialListingId(undefined)).toBeNull();
  });
});
