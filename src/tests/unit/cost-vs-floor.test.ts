import { describe, expect, it } from "vitest";
import {
  costVsFloor,
  formatDeltaPct,
} from "@/lib/market/cost-vs-floor";

describe("costVsFloor", () => {
  it("marks profit when floor is above cost", () => {
    const r = costVsFloor(0.5, 0.57);
    expect(r).not.toBeNull();
    expect(r!.status).toBe("profit");
    expect(r!.deltaPct).toBeCloseTo(14, 0);
  });

  it("marks loss when floor is below cost", () => {
    const r = costVsFloor(1, 0.8);
    expect(r!.status).toBe("loss");
    expect(r!.deltaPct).toBeCloseTo(-20, 0);
  });

  it("returns null without prices", () => {
    expect(costVsFloor(null, 1)).toBeNull();
    expect(costVsFloor(1, null)).toBeNull();
    expect(costVsFloor(0, 1)).toBeNull();
  });

  it("formats delta pct", () => {
    expect(formatDeltaPct(14.2)).toBe("+14.2%");
    expect(formatDeltaPct(-3.1)).toBe("-3.1%");
  });
});
