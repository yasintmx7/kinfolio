import { describe, expect, it, beforeEach } from "vitest";
import {
  getStoredTheme,
  isAppTheme,
  setTheme,
  storeTheme,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

describe("theme", () => {
  beforeEach(() => {
    storeTheme("dark");
  });

  it("validates theme values", () => {
    expect(isAppTheme("dark")).toBe(true);
    expect(isAppTheme("light")).toBe(true);
    expect(isAppTheme("auto")).toBe(false);
  });

  it("stores and reads light theme", () => {
    storeTheme("light");
    expect(getStoredTheme()).toBe("light");
    storeTheme("dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("setTheme writes storage", () => {
    setTheme("light");
    expect(getStoredTheme()).toBe("light");
  });
});
