/**
 * Deterministic Kintara-style character avatar from seller id / name.
 * No official avatar API — we paint a simple adventurer sprite per seed.
 */

export type SellerAvatarParts = {
  seed: number;
  bg: string;
  bg2: string;
  skin: string;
  hair: string;
  shirt: string;
  accent: string;
  eye: string;
  hairStyle: 0 | 1 | 2 | 3;
  accessory: 0 | 1 | 2 | 3; // none | bandana | hood | halo-ish
  initials: string;
};

const SKINS = ["#f0c9a0", "#e0b090", "#c48a6a", "#8d5a42", "#f5d4b0", "#d4a574"];
const HAIRS = [
  "#2a1f18",
  "#5c3a21",
  "#c9a45c",
  "#e8f2fa",
  "#3d7aa8",
  "#8b3a4a",
  "#1a1a1a",
  "#54b07c",
];
const SHIRTS = [
  "#5fa1cf",
  "#3d8f63",
  "#c9a45c",
  "#7ec4f0",
  "#d96b7a",
  "#2a4663",
  "#54b07c",
  "#e0bc72",
];
const BGS = [
  ["#1c334c", "#0a121c"],
  ["#172a40", "#122033"],
  ["#2a4663", "#122033"],
  ["#1a3a2a", "#0a121c"],
  ["#3d2a1a", "#0a121c"],
  ["#2a2040", "#0a121c"],
];

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], n: number): T {
  return arr[n % arr.length]!;
}

export function sellerAvatarParts(
  sellerId?: string | null,
  sellerName?: string | null,
): SellerAvatarParts {
  const name = (sellerName ?? "").trim();
  const id = (sellerId ?? "").trim();
  const key = id || name || "seller";
  const seed = hashSeed(key.toLowerCase());

  const initials = (name || id || "?")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "?";

  const [bg, bg2] = pick(BGS, seed);
  return {
    seed,
    bg,
    bg2,
    skin: pick(SKINS, seed >>> 3),
    hair: pick(HAIRS, seed >>> 6),
    shirt: pick(SHIRTS, seed >>> 9),
    accent: pick(SHIRTS, seed >>> 12),
    eye: "#1a2430",
    hairStyle: (seed % 4) as 0 | 1 | 2 | 3,
    accessory: ((seed >>> 2) % 4) as 0 | 1 | 2 | 3,
    initials,
  };
}
