import { describe, expect, it } from "vitest";
import { parseKintaraAlert } from "@/lib/parser/kintara-alert";

describe("parseKintaraAlert", () => {
  it("Test A — two-line buy", () => {
    const text = `Kintara Game · SOL | ✏️
Sent: 7.15 KINS (~$0.0571) To: GqTA..qMNG
Sent: 0.3763 KINS (~$0.003008) To: 4zW4..uQVt
Tx hash`;

    const parsed = parseKintaraAlert(text);
    expect(parsed.direction).toBe("buy");
    expect(parsed.totalSentKins.toFixed()).toBe("7.5263");
    expect(parsed.totalSentUsd.toFixed()).toBe("0.060108");
    expect(parsed.sentLines).toHaveLength(2);
  });

  it("Test B — sell", () => {
    const text = `Kintara Game · SOL | ✏️
Received: 9.31 KINS (~$0.0764) From: AVeH..J4Ce
Tx hash`;

    const parsed = parseKintaraAlert(text);
    expect(parsed.direction).toBe("sell");
    expect(parsed.totalReceivedKins.toFixed()).toBe("9.31");
    expect(parsed.totalReceivedUsd.toFixed()).toBe("0.0764");
  });

  it("tolerates commas and unicode spaces", () => {
    const text = "Sent:\u00a01,000.5 KINS (~$12.50) To: Abc..xyz";
    const parsed = parseKintaraAlert(text);
    expect(parsed.direction).toBe("buy");
    expect(parsed.totalSentKins.toFixed()).toBe("1000.5");
    expect(parsed.totalSentUsd.toFixed()).toBe("12.5");
  });

  it("marks mixed direction", () => {
    const text = `Sent: 1 KINS (~$0.01) To: A
Received: 2 KINS (~$0.02) From: B`;
    const parsed = parseKintaraAlert(text);
    expect(parsed.direction).toBe("mixed");
  });

  it("returns unknown when no lines", () => {
    const parsed = parseKintaraAlert("hello world");
    expect(parsed.direction).toBe("unknown");
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });
});
