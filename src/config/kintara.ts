export const KINS_MINT =
  process.env.NEXT_PUBLIC_KINS_MINT ??
  process.env.KINS_MINT ??
  "Tqj8yFmagrg7oorpQkVGYR52r96RFTamvWfth9bpump";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Kinfolio";
export const APP_TAGLINE =
  process.env.NEXT_PUBLIC_APP_TAGLINE ??
  "Kintara market floors + live sales tracker";

export const DEFAULT_SELL_FEE_PERCENT = "5";

export const FAVORITE_ITEM_NAMES = [
  "Axe",
  "Pickaxe",
  "Wild Sword",
  "Wood",
  "Coal",
  "Stone",
  "Metal",
  "Gold",
  "Cooked Fish",
  "Fish",
  "Health Potion",
  "Shield Potion",
  "Strength Potion",
  "Molten Rock",
  "Brute Horn",
] as const;

export const ALLOWED_UPSTREAM_HOSTS = [
  "api.dexscreener.com",
  "api.coingecko.com",
  "pro-api.coingecko.com",
  "mainnet.helius-rpc.com",
  "kintara.wiki",
  "kintaramarket.xyz",
  "www.kintrade.xyz",
  "kintrade.xyz",
  "fanout.kintara.gg",
  "kintara.com",
  "www.kintara.com",
] as const;
