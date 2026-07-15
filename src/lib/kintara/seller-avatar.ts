/**
 * Pixel-art Kintara-style character avatars (Willow / NPC vibe).
 * Deterministic from seller id or name — no official avatar API.
 *
 * Sprites are 16×16 grids of palette indices.
 */

export type PixelPalette = {
  outline: string;
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  shirt: string;
  shirtShade: string;
  pants: string;
  shoes: string;
  accent: string;
  eye: string;
  bg: string;
  bgDot: string;
};

/** Legend for templates: . empty, O outline, S skin, s shade, H hair, h hair shade,
 *  E eye, T shirt, t shade, P pants, F shoes, A accent, N neck */
export type SpriteTemplate = string[]; // 16 rows of 16 chars

/**
 * Templates inspired by kintara.wiki pixel NPCs (e.g. Willow):
 * blocky head, simple hair, tunic, pants, shoes — front 3/4 view.
 */
export const PIXEL_TEMPLATES: SpriteTemplate[] = [
  // 0 — short mop hair (Willow-like)
  [
    "................",
    ".....OOOOOO.....",
    "....OHHHHHHO....",
    "...OHHHHHHHHO...",
    "...OHSSSSSSHO...",
    "...OSS.EE.SSO...",
    "...OSSSSSSSSO...",
    "....OSSSSSSO....",
    ".....ONNNO......",
    "....OTTTTTO.....",
    "...OTTTTTTTTO...",
    "...OTTATTATTO...",
    "....OTTTTTTO....",
    ".....OPPPO......",
    "....OPO..OPO....",
    "....OFO..OFO....",
  ],
  // 1 — long hair sides
  [
    "................",
    "....OOOOOOOO....",
    "...OHHHHHHHHO...",
    "..OHHSSSSSSHHO..",
    "..OHSSSSSSSSHO..",
    "..OSS.EE.EESSO..",
    "..OHSSSSSSSSHO..",
    "..OH.OSSSSO.HO..",
    "...O..ONNO..O...",
    "....OTTTTTO.....",
    "...OTTTTTTTTO...",
    "...OTTTTTTTTO...",
    "....OTTAATTO....",
    ".....OPPPO......",
    "....OPO..OPO....",
    "....OFO..OFO....",
  ],
  // 2 — hood / cloak
  [
    "................",
    "....OOOOOOOO....",
    "...OTTTTTTTTO...",
    "..OTTTHHHHTTTO..",
    "..OTTHSSSSHTTTO.",
    "..OTH.SSSS.HTO..",
    "..OTSS.EE.SSTO..",
    "..OTSSSSSSSSTO..",
    "...OTSSSSSSSTO..",
    "....OTNNNNTO....",
    "...OTTTTTTTTO...",
    "..OTTTTTTTTTTO..",
    "...OTTTTTTTTO...",
    "....OTPPPTO.....",
    "....OPO..OPO....",
    "....OFO..OFO....",
  ],
  // 3 — spiky hair
  [
    "................",
    "...O.O.OO.O.O...",
    "..OHOHOHHOHOHO..",
    "...OHHHHHHHHO...",
    "...OHSSSSSSHO...",
    "...OSS.EE.SSO...",
    "...OSSSSSSSSO...",
    "....OSSSSSSO....",
    ".....ONNNO......",
    "....OTTTTTO.....",
    "...OTTAATTATO...",
    "...OTTTTTTTTO...",
    "....OTTTTTTO....",
    ".....OPPPO......",
    "....OPO..OPO....",
    "....OFO..OFO....",
  ],
  // 4 — cap / hat
  [
    "................",
    ".....OOOOOO.....",
    "....OAAAAAAO....",
    "...OAAAAAAAAO...",
    "...OAHHHHHHAO...",
    "...OSS.EE.SSO...",
    "...OSSSSSSSSO...",
    "....OSSSSSSO....",
    ".....ONNNO......",
    "....OTTTTTO.....",
    "...OTTTTTTTTO...",
    "...OTTTTTTTTO...",
    "....OTTAATTO....",
    ".....OPPPO......",
    "....OPO..OPO....",
    "....OFO..OFO....",
  ],
  // 5 — bald / short fringe
  [
    "................",
    ".....OOOOOO.....",
    "....OSSSSSSO....",
    "...OSSSSSSSSO...",
    "...OSSSSSSSSO...",
    "...OSS.EE.SSO...",
    "...OSSSSSSSSO...",
    "....OSSSSSSO....",
    ".....ONNNO......",
    "....OTTTTTO.....",
    "...OTTTTTTTTO...",
    "...OTTATTATTO...",
    "....OTTTTTTO....",
    ".....OPPPO......",
    "....OPO..OPO....",
    "....OFO..OFO....",
  ],
];

const PALETTE_SETS: Array<Omit<PixelPalette, "bg" | "bgDot" | "outline" | "eye">> = [
  {
    skin: "#e8b896",
    skinShade: "#c99472",
    hair: "#3d2918",
    hairShade: "#2a1a0e",
    shirt: "#3d8f63",
    shirtShade: "#2a6b48",
    pants: "#4a3728",
    shoes: "#2a1f18",
    accent: "#c9a45c",
  },
  {
    skin: "#f0c9a0",
    skinShade: "#d4a574",
    hair: "#1a1a1a",
    hairShade: "#0d0d0d",
    shirt: "#5fa1cf",
    shirtShade: "#3d7aa8",
    pants: "#2a4663",
    shoes: "#1a2430",
    accent: "#7ec4f0",
  },
  {
    skin: "#c48a6a",
    skinShade: "#a06a4a",
    hair: "#5c3a21",
    hairShade: "#3d2614",
    shirt: "#c9a45c",
    shirtShade: "#a8843e",
    pants: "#3d2a1a",
    shoes: "#1a120c",
    accent: "#e0bc72",
  },
  {
    skin: "#f5d4b0",
    skinShade: "#e0b890",
    hair: "#8b3a4a",
    hairShade: "#6a2a38",
    shirt: "#d96b7a",
    shirtShade: "#b04a58",
    pants: "#3a2a40",
    shoes: "#1a1218",
    accent: "#f0a0a8",
  },
  {
    skin: "#8d5a42",
    skinShade: "#6a4030",
    hair: "#1a120c",
    hairShade: "#0a0806",
    shirt: "#54b07c",
    shirtShade: "#3d8f63",
    pants: "#243040",
    shoes: "#121820",
    accent: "#7ec4f0",
  },
  {
    skin: "#e0b090",
    skinShade: "#c09070",
    hair: "#e8f2fa",
    hairShade: "#b0c8d8",
    shirt: "#2a4663",
    shirtShade: "#1c334c",
    pants: "#1a2430",
    shoes: "#0a121c",
    accent: "#5fa1cf",
  },
  {
    skin: "#f0c9a0",
    skinShade: "#d4a574",
    hair: "#c9a45c",
    hairShade: "#a8843e",
    shirt: "#7ec4f0",
    shirtShade: "#5fa1cf",
    pants: "#3d2a50",
    shoes: "#1a1220",
    accent: "#e0bc72",
  },
  {
    skin: "#d4a574",
    skinShade: "#b08050",
    hair: "#2a1f18",
    hairShade: "#1a120c",
    shirt: "#8eabc2",
    shirtShade: "#5a7a90",
    pants: "#2a4663",
    shoes: "#122033",
    accent: "#3d8f63",
  },
];

const BGS = [
  { bg: "#0e1a28", bgDot: "#152536" },
  { bg: "#122033", bgDot: "#1a3048" },
  { bg: "#0a1814", bgDot: "#122820" },
  { bg: "#1a1420", bgDot: "#281e30" },
  { bg: "#1a1810", bgDot: "#282418" },
  { bg: "#101820", bgDot: "#182430" },
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
  size: 16;
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
  const colors = PALETTE_SETS[(seed >>> 4) % PALETTE_SETS.length]!;
  const bgPair = BGS[(seed >>> 8) % BGS.length]!;

  return {
    seed,
    templateIndex,
    template: PIXEL_TEMPLATES[templateIndex]!,
    size: 16,
    palette: {
      outline: "#0a0e14",
      eye: "#1a1010",
      ...colors,
      ...bgPair,
    },
  };
}

/** Map grid char → fill color (null = transparent). */
export function pixelColor(
  ch: string,
  p: PixelPalette,
): string | null {
  switch (ch) {
    case "O":
      return p.outline;
    case "S":
      return p.skin;
    case "s":
      return p.skinShade;
    case "H":
      return p.hair;
    case "h":
      return p.hairShade;
    case "E":
      return p.eye;
    case "T":
      return p.shirt;
    case "t":
      return p.shirtShade;
    case "P":
      return p.pants;
    case "F":
      return p.shoes;
    case "A":
      return p.accent;
    case "N":
      return p.skinShade;
    case ".":
    default:
      return null;
  }
}
