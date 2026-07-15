import { describe, expect, it } from "vitest";
import { resolveWikiItemImage } from "@/lib/kintara/wiki-images";

describe("resolveWikiItemImage", () => {
  it("resolves core resources", () => {
    expect(resolveWikiItemImage("stone")).toMatch(/kintara\.wiki\/images\//);
    expect(resolveWikiItemImage("wood")).toMatch(/kintara\.wiki\/images\//);
    expect(resolveWikiItemImage("coal")).toMatch(/kintara\.wiki\/images\//);
  });

  it("resolves market item types", () => {
    expect(resolveWikiItemImage("cooked_fish_meat")).toMatch(
      /kintara\.wiki\/images\//,
    );
    expect(resolveWikiItemImage("molten_rock")).toMatch(/kintara\.wiki\/images\//);
    expect(resolveWikiItemImage("tool_pickaxe_l2", ["Pickaxe"])).toMatch(
      /kintara\.wiki\/images\//,
    );
  });

  it("uses clean art for Brute Horn and Molten Rock", () => {
    expect(resolveWikiItemImage("brute_horn")).toContain("Brute_horn.png");
    expect(resolveWikiItemImage("Brute Horn")).toContain("Brute_horn.png");
    expect(resolveWikiItemImage("molten_rock")).toContain("Molten_rock.png");
    expect(resolveWikiItemImage("Molten Rock")).toContain("Molten_rock.png");
  });

  it("returns undefined for nonsense", () => {
    expect(resolveWikiItemImage("definitely-not-a-real-item-xyz")).toBeUndefined();
  });
});
