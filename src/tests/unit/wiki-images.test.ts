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

  it("returns undefined for nonsense", () => {
    expect(resolveWikiItemImage("definitely-not-a-real-item-xyz")).toBeUndefined();
  });
});
