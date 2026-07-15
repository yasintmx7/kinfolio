import { describe, expect, it } from "vitest";
import { splitAlertPaste } from "@/lib/parser/split-alerts";

describe("splitAlertPaste", () => {
  it("returns one chunk for a single alert", () => {
    const text = `Kintara Game · SOL
Sent: 7.15 KINS (~$0.0571) To: A
Sent: 0.3763 KINS (~$0.003008) To: B
Tx hash`;
    const chunks = splitAlertPaste(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].parsed.direction).toBe("buy");
  });

  it("splits blank-line separated alerts", () => {
    const text = `Sent: 1 KINS (~$0.01) To: A

Received: 2 KINS (~$0.02) From: B`;
    const chunks = splitAlertPaste(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].parsed.direction).toBe("buy");
    expect(chunks[1].parsed.direction).toBe("sell");
  });
});
