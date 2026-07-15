/**
 * Kintara marketplace-style avatars (Minecraft cube character).
 * Matches cosmetic shop look: blocky head, simple face, sky-blue plate.
 * Deterministic from seller id / name.
 *
 * Sprites are 32×32 grids. Legend:
 *  . empty (shows bg)
 *  B bg mid   b bg light   D bg dark edge
 *  S skin     s skin shade
 *  K black / mask dark
 *  W white / eye white
 *  E eye dark
 *  M mouth
 *  T shirt / shorts    t shade
 *  P pants             p shade
 *  A accent (camo spot, belt)
 *  O outline (near-black)
 */

export type SpriteTemplate = string[]; // 32 rows × 32 chars

export type PixelPalette = {
  bg: string;
  bgMid: string;
  bgDark: string;
  skin: string;
  skinShade: string;
  mask: string;
  shirt: string;
  shirtShade: string;
  pants: string;
  pantsShade: string;
  accent: string;
  eye: string;
  outline: string;
};

/** 32×32 — cube head + blocky body (Kintara shop pose). */
export const PIXEL_TEMPLATES: SpriteTemplate[] = [
  // 0 — bare face, green shorts (Camo Shorts vibe)
  [
    "................................",
    "................................",
    "..........bbbbbbbbbb............",
    ".........bBBBBBBBBBBb...........",
    "........bBBBBBBBBBBBBb..........",
    ".......bBBSSSSSSSSSSBBb.........",
    ".......bBSSSSSSSSSSSSBb.........",
    ".......bBSSSSSSSSSSSSBb.........",
    ".......bBSS.EE..EE.SSBb.........",
    ".......bBSS.EE..EE.SSBb.........",
    ".......bBSSSSSSSSSSSSBb.........",
    ".......bBSSSSMMSSSSSSBb.........",
    ".......bBSSSSSSSSSSSSBb.........",
    ".......bBssssssssssssBb.........",
    "........bBSSSSSSSSSSBb..........",
    ".........bBssssssssBb...........",
    "..........bBSSSSSSBb............",
    "...........bBSSSSBb.............",
    "..........bBSSSSSSBb............",
    ".........bBSSSSSSSSBb...........",
    "........bBSSSSSSSSSSBb..........",
    "........bBSTTTTTTTTSBb..........",
    "........bBSTTTTTTTTSBb..........",
    "........bBSTTAAAATTSBb..........",
    "........bBSTTTTTTTTSBb..........",
    ".........bBSSSSSSSSBb...........",
    "..........bBSS..SSBb............",
    "..........bBSS..SSBb............",
    "..........bBSS..SSBb............",
    "..........bBSS..SSBb............",
    "...........bb....bb.............",
    "................................",
  ],
  // 1 — Sheisty / black balaclava
  [
    "................................",
    "................................",
    "..........bbbbbbbbbb............",
    ".........bBBBBBBBBBBb...........",
    "........bBBBBBBBBBBBBb..........",
    ".......bBBKKKKKKKKKKBBb.........",
    ".......bBKKKKKKKKKKKKBb.........",
    ".......bBKKKKKKKKKKKKBb.........",
    ".......bBKK.WW..WW.KKBb.........",
    ".......bBKK.EE..EE.KKBb.........",
    ".......bBKKKKKKKKKKKKBb.........",
    ".......bBKKKKMMKKKKKKBb.........",
    ".......bBKKKKKKKKKKKKBb.........",
    ".......bBkkkkkkkkkkkkBb.........",
    "........bBSSSSSSSSSSBb..........",
    ".........bBssssssssBb...........",
    "..........bBSSSSSSBb............",
    "...........bBSSSSBb.............",
    "..........bBSSSSSSBb............",
    ".........bBSSSSSSSSBb...........",
    "........bBSSSSSSSSSSBb..........",
    "........bBSTTTTTTTTSBb..........",
    "........bBSTTTTTTTTSBb..........",
    "........bBSTTTTTTTTSBb..........",
    "........bBSTTTTTTTTSBb..........",
    ".........bBSSSSSSSSBb...........",
    "..........bBSS..SSBb............",
    "..........bBSS..SSBb............",
    "..........bBSS..SSBb............",
    "..........bBSS..SSBb............",
    "...........bb....bb.............",
    "................................",
  ],
  // 2 — full shirt + pants (dressed adventurer)
  [
    "................................",
    "................................",
    "..........bbbbbbbbbb............",
    ".........bBBBBBBBBBBb...........",
    "........bBBBBBBBBBBBBb..........",
    ".......bBBSSSSSSSSSSBBb.........",
    ".......bBSSSSSSSSSSSSBb.........",
    ".......bBSSSSSSSSSSSSBb.........",
    ".......bBSS.EE..EE.SSBb.........",
    ".......bBSS.EE..EE.SSBb.........",
    ".......bBSSSSSSSSSSSSBb.........",
    ".......bBSSSSMMSSSSSSBb.........",
    ".......bBSSSSSSSSSSSSBb.........",
    ".......bBssssssssssssBb.........",
    "........bBTTTTTTTTTBb...........",
    ".........bBTTTTTTTTBb...........",
    "..........bBTTTTTTBb............",
    "...........bBTTTTBb.............",
    "..........bBTTTTTTBb............",
    ".........bBTTTTTTTTBb...........",
    "........bBTTTTTTTTTTBb..........",
    "........bBTTTTTTTTTTBb..........",
    "........bBTTTTATTTTTBb..........",
    "........bBTTTTTTTTTTBb..........",
    ".........bBPPPPPPPPBb...........",
    "..........bBPP..PPBb............",
    "..........bBPP..PPBb............",
    "..........bBPP..PPBb............",
    "..........bBPP..PPBb............",
    "..........bBSS..SSBb............",
    "...........bb....bb.............",
    "................................",
  ],
  // 3 — hood up (dark hood + face)
  [
    "................................",
    "................................",
    "..........bbbbbbbbbb............",
    ".........bBBBBBBBBBBb...........",
    "........bBBKKKKKKKKKBb..........",
    ".......bBKKKKKKKKKKKKBb.........",
    ".......bBKKSSSSSSSSKKBb.........",
    ".......bBKSSSSSSSSSSKBb.........",
    ".......bBKSS.EE..EE.SBb.........",
    ".......bBKSS.EE..EE.SBb.........",
    ".......bBKSSSSSSSSSSKBb.........",
    ".......bBKSSSSMMSSSSKBb.........",
    ".......bBKKSSSSSSSSKKBb.........",
    ".......bBKKKKKKKKKKKKBb.........",
    "........bBSSSSSSSSSSBb..........",
    ".........bBssssssssBb...........",
    "..........bBSSSSSSBb............",
    "...........bBSSSSBb.............",
    "..........bBTTTTTTBb............",
    ".........bBTTTTTTTTBb...........",
    "........bBTTTTTTTTTTBb..........",
    "........bBTTTTTTTTTTBb..........",
    "........bBTTTTTTTTTTBb..........",
    "........bBTTTTTTTTTTBb..........",
    ".........bBPPPPPPPPBb...........",
    "..........bBPP..PPBb............",
    "..........bBPP..PPBb............",
    "..........bBPP..PPBb............",
    "..........bBPP..PPBb............",
    "..........bBSS..SSBb............",
    "...........bb....bb.............",
    "................................",
  ],
  // 4 — hair block on top (short hair)
  [
    "................................",
    "................................",
    "..........bbbbbbbbbb............",
    ".........bBBBBBBBBBBb...........",
    "........bBBKKKKKKKKKBb..........",
    ".......bBBKKKKKKKKKKBBb.........",
    ".......bBKSSSSSSSSSSKBb.........",
    ".......bBSSSSSSSSSSSSBb.........",
    ".......bBSS.EE..EE.SSBb.........",
    ".......bBSS.EE..EE.SSBb.........",
    ".......bBSSSSSSSSSSSSBb.........",
    ".......bBSSSSMMSSSSSSBb.........",
    ".......bBSSSSSSSSSSSSBb.........",
    ".......bBssssssssssssBb.........",
    "........bBSSSSSSSSSSBb..........",
    ".........bBssssssssBb...........",
    "..........bBSSSSSSBb............",
    "...........bBSSSSBb.............",
    "..........bBTTTTTTBb............",
    ".........bBTTTTTTTTBb...........",
    "........bBTTTTTTTTTTBb..........",
    "........bBTTTTTTTTTTBb..........",
    "........bBTTTAATTATTBb..........",
    "........bBTTTTTTTTTTBb..........",
    ".........bBPPPPPPPPBb...........",
    "..........bBPP..PPBb............",
    "..........bBPP..PPBb............",
    "..........bBPP..PPBb............",
    "..........bBPP..PPBb............",
    "..........bBSS..SSBb............",
    "...........bb....bb.............",
    "................................",
  ],
  // 5 — bare + camo shorts accent spots
  [
    "................................",
    "................................",
    "..........bbbbbbbbbb............",
    ".........bBBBBBBBBBBb...........",
    "........bBBBBBBBBBBBBb..........",
    ".......bBBSSSSSSSSSSBBb.........",
    ".......bBSSSSSSSSSSSSBb.........",
    ".......bBSSSSSSSSSSSSBb.........",
    ".......bBSS.EE..EE.SSBb.........",
    ".......bBSS.EE..EE.SSBb.........",
    ".......bBSSSSSSSSSSSSBb.........",
    ".......bBSSSSMMSSSSSSBb.........",
    ".......bBSSSSSSSSSSSSBb.........",
    ".......bBssssssssssssBb.........",
    "........bBSSSSSSSSSSBb..........",
    ".........bBssssssssBb...........",
    "..........bBSSSSSSBb............",
    "...........bBSSSSBb.............",
    "..........bBSSSSSSBb............",
    ".........bBSSSSSSSSBb...........",
    "........bBSSSSSSSSSSBb..........",
    "........bBSTATAATAASBb..........",
    "........bBSTTTTTTTTSBb..........",
    "........bBSTAATAATTSBb..........",
    "........bBSTTTTTTTTSBb..........",
    ".........bBSSSSSSSSBb...........",
    "..........bBSS..SSBb............",
    "..........bBSS..SSBb............",
    "..........bBSS..SSBb............",
    "..........bBSS..SSBb............",
    "...........bb....bb.............",
    "................................",
  ],
];

const SKIN_SETS = [
  { skin: "#e0b896", skinShade: "#c99472" },
  { skin: "#f0c9a0", skinShade: "#d4a574" },
  { skin: "#c48a6a", skinShade: "#a06a4a" },
  { skin: "#f5d4b0", skinShade: "#e0b890" },
  { skin: "#8d5a42", skinShade: "#6a4030" },
  { skin: "#d4a070", skinShade: "#b08050" },
];

const CLOTH_SETS = [
  { shirt: "#4a8f5c", shirtShade: "#2f6b40", pants: "#3d5c3a", pantsShade: "#2a4028", accent: "#2a5a30" },
  { shirt: "#5fa1cf", shirtShade: "#3d7aa8", pants: "#2a4663", pantsShade: "#1c334c", accent: "#7ec4f0" },
  { shirt: "#c9a45c", shirtShade: "#a8843e", pants: "#4a3728", pantsShade: "#2a1f18", accent: "#e0bc72" },
  { shirt: "#d96b7a", shirtShade: "#b04a58", pants: "#3a2a40", pantsShade: "#1a1220", accent: "#f0a0a8" },
  { shirt: "#6b6b6b", shirtShade: "#404040", pants: "#3a3a3a", pantsShade: "#222", accent: "#8a8a8a" },
  { shirt: "#54b07c", shirtShade: "#3d8f63", pants: "#243040", pantsShade: "#121820", accent: "#7ec4f0" },
  { shirt: "#8eabc2", shirtShade: "#5a7a90", pants: "#2a4663", pantsShade: "#122033", accent: "#3d8f63" },
  { shirt: "#2a4663", shirtShade: "#1c334c", pants: "#1a2430", pantsShade: "#0a121c", accent: "#5fa1cf" },
];

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type SellerPixelAvatar = {
  seed: number;
  templateIndex: number;
  template: SpriteTemplate;
  palette: PixelPalette;
  size: 32;
};

export function sellerPixelAvatar(
  sellerId?: string | null,
  sellerName?: string | null,
): SellerPixelAvatar {
  const name = (sellerName ?? "").trim();
  const id = (sellerId ?? "").trim();
  const key = (id || name || "seller").toLowerCase();
  const seed = hashSeed(key);
  const templateIndex = seed % PIXEL_TEMPLATES.length;
  const skin = SKIN_SETS[(seed >>> 3) % SKIN_SETS.length]!;
  const cloth = CLOTH_SETS[(seed >>> 7) % CLOTH_SETS.length]!;

  return {
    seed,
    templateIndex,
    template: PIXEL_TEMPLATES[templateIndex]!,
    size: 32,
    palette: {
      // Kintara shop card sky
      bg: "#9fd0ee",
      bgMid: "#7eb8e0",
      bgDark: "#5a9cc8",
      skin: skin.skin,
      skinShade: skin.skinShade,
      mask: "#1a1a1a",
      shirt: cloth.shirt,
      shirtShade: cloth.shirtShade,
      pants: cloth.pants,
      pantsShade: cloth.pantsShade,
      accent: cloth.accent,
      eye: "#1a1010",
      outline: "#0a0e14",
    },
  };
}

export function pixelColor(ch: string, p: PixelPalette): string | null {
  switch (ch) {
    case "B":
      return p.bgMid;
    case "b":
      return p.bg;
    case "D":
      return p.bgDark;
    case "S":
      return p.skin;
    case "s":
      return p.skinShade;
    case "K":
      return p.mask;
    case "k":
      return "#0d0d0d";
    case "W":
      return "#f0f0f0";
    case "E":
      return p.eye;
    case "M":
      return "#6a4030";
    case "T":
      return p.shirt;
    case "t":
      return p.shirtShade;
    case "P":
      return p.pants;
    case "p":
      return p.pantsShade;
    case "A":
      return p.accent;
    case "O":
      return p.outline;
    case ".":
    default:
      return null;
  }
}
