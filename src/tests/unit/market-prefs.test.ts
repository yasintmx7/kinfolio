import { describe, expect, it, beforeEach } from "vitest";
import { getMarketPrefs, setMarketPrefs } from "@/lib/market/market-prefs";

describe("market-prefs", () => {
  beforeEach(() => {
    setMarketPrefs({
      currencyFilter: "all",
      sortFilter: "cheap",
      hideLocked: false,
      categoryFilter: "all",
      browseSort: "listings",
    });
  });

  it("merges and persists filter prefs", () => {
    setMarketPrefs({ currencyFilter: "gold", hideLocked: true });
    const p = getMarketPrefs();
    expect(p.currencyFilter).toBe("gold");
    expect(p.hideLocked).toBe(true);
    setMarketPrefs({ sortFilter: "new" });
    expect(getMarketPrefs().sortFilter).toBe("new");
    expect(getMarketPrefs().currencyFilter).toBe("gold");
  });
});
