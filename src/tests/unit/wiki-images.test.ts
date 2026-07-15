import { describe, expect, it } from "vitest";
import { resolveWikiItemImage } from "@/lib/kintara/wiki-images";

describe("resolveWikiItemImage", () => {
  it("resolves core resources to local transparent icons", () => {
    expect(resolveWikiItemImage("stone")).toMatch(/^\/item-icons\/.+\.webp$/);
    expect(resolveWikiItemImage("wood")).toMatch(/^\/item-icons\/.+\.webp$/);
    expect(resolveWikiItemImage("coal")).toMatch(/^\/item-icons\/.+\.webp$/);
  });

  it("resolves market item types", () => {
    expect(resolveWikiItemImage("cooked_fish_meat")).toMatch(
      /^\/item-icons\/.+\.webp$/,
    );
    expect(resolveWikiItemImage("molten_rock")).toMatch(
      /^\/item-icons\/.+\.webp$/,
    );
    expect(resolveWikiItemImage("tool_pickaxe_l2", ["Pickaxe"])).toMatch(
      /item-icons|kintara\.wiki/,
    );
  });

  it("uses processed icons for Brute Horn and Molten Rock", () => {
    expect(resolveWikiItemImage("brute_horn")).toBe(
      "/item-icons/brute-horn.webp",
    );
    expect(resolveWikiItemImage("Brute Horn")).toBe(
      "/item-icons/brute-horn.webp",
    );
    expect(resolveWikiItemImage("molten_rock")).toBe(
      "/item-icons/molten-rock.webp",
    );
    expect(resolveWikiItemImage("Molten Rock")).toBe(
      "/item-icons/molten-rock.webp",
    );
  });

  it("returns undefined for nonsense", () => {
    expect(resolveWikiItemImage("definitely-not-a-real-item-xyz")).toBeUndefined();
  });
});
