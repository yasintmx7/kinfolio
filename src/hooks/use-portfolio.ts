"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearAllPortfolioData,
  db,
  deleteTransaction,
  ensureSeeded,
  getAllTransactions,
  getSettings,
  saveTransaction,
  updateSettings,
  type SettingsRow,
} from "@/db/dexie";
import { rebuildPortfolio } from "@/lib/accounting/engine";
import type {
  BackupPayload,
  KintaraItem,
  ManualMarketPrice,
  PortfolioTransaction,
  UserSettings,
} from "@/lib/accounting/types";
import { STATIC_CATALOG } from "@/data/static-catalog";
import { buildFingerprint } from "@/lib/parser/fingerprint";
import { uid } from "@/lib/utils";

export function usePortfolio() {
  const [ready, setReady] = useState(false);
  const [transactions, setTransactions] = useState<PortfolioTransaction[]>([]);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [items, setItems] = useState<KintaraItem[]>(STATIC_CATALOG);
  const [marketPrices, setMarketPrices] = useState<ManualMarketPrice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await ensureSeeded();
    const [txs, s, catalog, prices] = await Promise.all([
      getAllTransactions(),
      getSettings(),
      db.items.toArray(),
      db.marketPrices.toArray(),
    ]);
    setTransactions(txs);
    setSettings(s);
    setItems(catalog.length ? catalog : STATIC_CATALOG);
    setMarketPrices(
      prices.map((p) => ({
        itemId: p.itemId,
        unitPriceKins: p.unitPriceKins,
        updatedAt: p.updatedAt,
        note: p.note,
      })),
    );
    setReady(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((e) => {
      setError(e instanceof Error ? e.message : "Failed to load portfolio");
      setReady(true);
    });
  }, [refresh]);

  const summary = useMemo(() => rebuildPortfolio(transactions), [transactions]);

  const itemMap = useMemo(() => {
    const m = new Map<string, KintaraItem>();
    for (const i of items) m.set(i.id, i);
    return m;
  }, [items]);

  const priceMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of marketPrices) m.set(p.itemId, p.unitPriceKins);
    return m;
  }, [marketPrices]);

  const addTransaction = useCallback(
    async (
      input: Omit<
        PortfolioTransaction,
        "id" | "schemaVersion" | "createdAt" | "updatedAt" | "fingerprint"
      > & { fingerprint?: string; id?: string },
    ) => {
      const now = new Date().toISOString();
      const fingerprint =
        input.fingerprint ??
        buildFingerprint({
          rawAlert: input.rawAlert,
          direction: input.type,
          itemId: input.itemId,
          quantity: input.quantity,
          kinsAmount: input.kinsAmount,
          usdAmount: input.usdAmountAtTransaction,
          txHash: input.txHash,
          transactionAt: input.transactionAt,
        });

      // Always read fresh from DB so bulk imports (buy then sell) see prior rows
      const current = await getAllTransactions();
      const existing = current.find((t) => t.fingerprint === fingerprint);
      if (existing && !input.id) {
        return { ok: false as const, duplicate: existing };
      }

      if (input.type === "sell") {
        const { canSell } = await import("@/lib/accounting/engine");
        const check = canSell(current, input.itemId, input.quantity);
        if (!check.ok) {
          return { ok: false as const, error: check.message, available: check.available };
        }
      }

      const row: PortfolioTransaction = {
        ...input,
        id: input.id ?? uid(),
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        fingerprint,
      };
      await saveTransaction(row);
      await refresh();
      return { ok: true as const, transaction: row };
    },
    [refresh],
  );

  const removeTransaction = useCallback(
    async (id: string) => {
      await deleteTransaction(id);
      await refresh();
    },
    [refresh],
  );

  const patchSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      const next = await updateSettings(patch);
      setSettings(next);
      return next;
    },
    [],
  );

  const setManualPrice = useCallback(
    async (itemId: string, unitPriceKins: string) => {
      const row = {
        id: itemId,
        itemId,
        unitPriceKins,
        updatedAt: new Date().toISOString(),
      };
      await db.marketPrices.put(row);
      await refresh();
    },
    [refresh],
  );

  const exportBackup = useCallback(async (): Promise<BackupPayload> => {
    const s = settings ?? (await getSettings());
    const customItems = items.filter((i) => i.source !== "static_seed");
    return {
      app: "kintara-portfolio",
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      transactions,
      settings: s,
      customItems,
      marketPrices,
    };
  }, [settings, items, transactions, marketPrices]);

  const importBackup = useCallback(
    async (
      payload: BackupPayload,
      mode: "merge" | "replace",
    ): Promise<{ imported: number; skipped: number }> => {
      if (payload.app !== "kintara-portfolio") {
        throw new Error("Invalid backup file (app mismatch).");
      }
      if (mode === "replace") {
        await clearAllPortfolioData();
      }
      let imported = 0;
      let skipped = 0;
      const existing = mode === "merge" ? await getAllTransactions() : [];
      const fps = new Set(existing.map((t) => t.fingerprint));

      for (const t of payload.transactions) {
        if (fps.has(t.fingerprint)) {
          skipped++;
          continue;
        }
        await saveTransaction({
          ...t,
          id: t.id || uid(),
          schemaVersion: 1,
        });
        fps.add(t.fingerprint);
        imported++;
      }

      if (payload.settings) {
        await updateSettings({
          ...payload.settings,
          onboardingComplete: true,
        });
      }
      for (const p of payload.marketPrices ?? []) {
        await db.marketPrices.put({ ...p, id: p.itemId });
      }
      for (const item of payload.customItems ?? []) {
        await db.items.put(item);
      }
      await refresh();
      return { imported, skipped };
    },
    [refresh],
  );

  const wipeData = useCallback(async () => {
    await clearAllPortfolioData();
    await refresh();
  }, [refresh]);

  const loadDemo = useCallback(async () => {
    const now = Date.now();
    const demo: PortfolioTransaction[] = [
      {
        id: uid(),
        schemaVersion: 1,
        type: "buy",
        itemId: "stone",
        quantity: "100",
        transactionAt: new Date(now - 86400000 * 3).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        kinsAmount: "25",
        usdAmountAtTransaction: "2",
        fingerprint: "demo-buy-stone",
        note: "Demo buy",
      },
      {
        id: uid(),
        schemaVersion: 1,
        type: "mined",
        itemId: "stone",
        quantity: "100",
        transactionAt: new Date(now - 86400000 * 2).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        kinsAmount: "0",
        usdAmountAtTransaction: "0",
        fingerprint: "demo-mine-stone",
        source: "mining",
        tool: "Pickaxe",
        location: "Demo cave",
        durationMinutes: "60",
        note: "Demo mining session",
      },
      {
        id: uid(),
        schemaVersion: 1,
        type: "sell",
        itemId: "stone",
        quantity: "50",
        transactionAt: new Date(now - 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        kinsAmount: "12.5",
        usdAmountAtTransaction: "1",
        sellAmountIsNet: true,
        fingerprint: "demo-sell-stone",
        note: "Demo sell",
      },
    ];
    for (const t of demo) await saveTransaction(t);
    await updateSettings({ onboardingComplete: true });
    await refresh();
  }, [refresh]);

  return {
    ready,
    error,
    transactions,
    settings,
    items,
    itemMap,
    marketPrices,
    priceMap,
    summary,
    refresh,
    addTransaction,
    removeTransaction,
    patchSettings,
    setManualPrice,
    exportBackup,
    importBackup,
    wipeData,
    loadDemo,
  };
}

export type PortfolioContextValue = ReturnType<typeof usePortfolio>;
