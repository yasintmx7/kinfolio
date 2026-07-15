import { describe, expect, it } from "vitest";
import { BLOCKED_WRITE_ENDPOINTS } from "@/lib/kintara/official-marketplace";

describe("official marketplace policy", () => {
  it("blocks purchase/reserve endpoints", () => {
    expect(
      BLOCKED_WRITE_ENDPOINTS.some((e) => e.includes("token-quote")),
    ).toBe(true);
    expect(
      BLOCKED_WRITE_ENDPOINTS.some((e) => e.includes("token-buy-confirm")),
    ).toBe(true);
    expect(BLOCKED_WRITE_ENDPOINTS.some((e) => e.includes("reserve"))).toBe(
      true,
    );
  });
});
