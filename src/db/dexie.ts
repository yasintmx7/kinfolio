"use client";

import Dexie, { type Table } from "dexie";
import type {
  KintaraItem,
  ManualMarketPrice,
  PortfolioTransaction,
  UserSettings,
} from "@/lib/accounting/types";
import { getDefaultFavoriteIds, STATIC_CATALOG } from "@/data/static-catalog";
import { DEFAULT_SELL_FEE_PERCENT } from "@/config/kintara";

export type MarketSnapshotRow = {
  id: string;
  itemId: string;
  unitPriceKins: string;
  source: string;
  capturedAt: string;
  payload?: string;
};

export type SyncStateRow = {
  id: string;
  key: string;
  value: string;
  updatedAt: string;
};

export type SettingsRow = UserSettings & { id: string };

export class KintaraPortfolioDB extends Dexie {
  transactions!: Table<PortfolioTransaction, string>;
  items!: Table<KintaraItem, string>;
  itemAliases!: Table<{ id: string; alias: string; itemId: string }, string>;
  marketSnapshots!: Table<MarketSnapshotRow, string>;
  settings!: Table<SettingsRow, string>;
  syncState!: Table<SyncStateRow, string>;
  marketPrices!: Table<ManualMarketPrice & { id: string }, string>;

  constructor() {
    super("kintara-portfolio");

    this.version(1).stores({
      transactions:
        "id, createdAt, transactionAt, type, itemId, txHash, fingerprint",
      items: "id, name, slug, category, isFavoriteDefault",
      itemAliases: "id, alias, itemId",
      marketSnapshots: "id, itemId, capturedAt, source",
      settings: "id",
      syncState: "id, key",
      marketPrices: "id, itemId, updatedAt",
    });
  }
}

export const db = new KintaraPortfolioDB();

export function defaultSettings(): SettingsRow {
  const now = new Date().toISOString();
  return {
    id: "default",
    schemaVersion: 1,
    defaultSellFeePercent: DEFAULT_SELL_FEE_PERCENT,
    feeTargetMode: "simple_add",
    sellAlertsAreNetByDefault: true,
    valuationMethod: "manual",
    currencyUsdPrecision: 6,
    currencyKinsPrecision: 8,
    theme: "dark",
    favoriteItemIds: getDefaultFavoriteIds(),
    onboardingComplete: false,
    updatedAt: now,
  };
}

export async function ensureSeeded(): Promise<void> {
  const settings = await db.settings.get("default");
  if (!settings) {
    await db.settings.put(defaultSettings());
  }

  const count = await db.items.count();
  if (count === 0) {
    await db.items.bulkPut(STATIC_CATALOG);
    const aliases = STATIC_CATALOG.flatMap((item) =>
      item.aliases.map((alias) => ({
        id: `${item.id}:${alias.toLowerCase()}`,
        alias: alias.toLowerCase(),
        itemId: item.id,
      })),
    );
    if (aliases.length) await db.itemAliases.bulkPut(aliases);
  }
}

export async function getSettings(): Promise<SettingsRow> {
  await ensureSeeded();
  const s = await db.settings.get("default");
  return s ?? defaultSettings();
}

export async function updateSettings(
  patch: Partial<UserSettings>,
): Promise<SettingsRow> {
  const current = await getSettings();
  const next: SettingsRow = {
    ...current,
    ...patch,
    id: "default",
    updatedAt: new Date().toISOString(),
  };
  await db.settings.put(next);
  return next;
}

export async function getAllTransactions(): Promise<PortfolioTransaction[]> {
  await ensureSeeded();
  return db.transactions.orderBy("transactionAt").toArray();
}

export async function saveTransaction(
  tx: PortfolioTransaction,
): Promise<void> {
  await db.transactions.put(tx);
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id);
}

export async function clearAllPortfolioData(): Promise<void> {
  await db.transaction(
    "rw",
    db.transactions,
    db.marketPrices,
    db.marketSnapshots,
    async () => {
      await db.transactions.clear();
      await db.marketPrices.clear();
      await db.marketSnapshots.clear();
    },
  );
}
