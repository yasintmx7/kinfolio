"use client";

import { useRef, useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { usePortfolioContext } from "@/components/providers/portfolio-provider";
import { useToast } from "@/components/feedback/toast";
import type { BackupPayload, FeeTargetMode, ValuationMethod } from "@/lib/accounting/types";
import { z } from "zod";

const backupSchema = z.object({
  app: z.literal("kintara-portfolio"),
  exportVersion: z.literal(1),
  exportedAt: z.string(),
  transactions: z.array(z.record(z.string(), z.unknown())),
  settings: z.record(z.string(), z.unknown()).optional(),
  customItems: z.array(z.record(z.string(), z.unknown())).optional(),
  marketPrices: z.array(z.record(z.string(), z.unknown())).optional(),
});

export default function SettingsPage() {
  const {
    settings,
    patchSettings,
    exportBackup,
    importBackup,
    wipeData,
    items,
    ready,
  } = usePortfolioContext();
  const { push } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<BackupPayload | null>(null);
  const [apiStatus, setApiStatus] = useState<string>("");

  if (!ready || !settings) {
    return <div className="text-muted">Loading settings…</div>;
  }

  async function checkApis() {
    try {
      const [health, price, lb] = await Promise.all([
        fetch("/api/health").then((r) => r.json()),
        fetch("/api/price/kins").then((r) => r.json()),
        fetch("/api/leaderboard?category=pvp&limit=3").then((r) => r.json()),
      ]);
      setApiStatus(
        JSON.stringify(
          {
            health: health.ok ? health.data : health.error,
            price: price.ok
              ? {
                  source: price.source,
                  updatedAt: price.updatedAt,
                  stale: price.stale,
                  priceUsd: price.data?.priceUsd,
                }
              : price.error,
            leaderboard: lb.ok
              ? {
                  source: lb.source,
                  count: lb.data?.count,
                  total: lb.data?.total,
                  sample: lb.data?.entries?.[0]?.username,
                  authConfigured: lb.data?.authConfigured,
                }
              : lb.error,
          },
          null,
          2,
        ),
      );
    } catch (e) {
      setApiStatus(e instanceof Error ? e.message : "Failed");
    }
  }

  async function onExport() {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kintara-portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    push("Backup exported", "ok");
  }

  async function onFile(file: File) {
    const text = await file.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      push("Invalid JSON", "err");
      return;
    }
    const parsed = backupSchema.safeParse(json);
    if (!parsed.success) {
      push("Backup failed validation", "err");
      return;
    }
    setImportPreview(json as BackupPayload);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Preferences stay in this browser. Export regularly.
        </p>
      </div>

      <Card className="space-y-2">
        <CardTitle>Data caps (read-only market)</CardTitle>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
          <li>Live open book is partial (~1–1.2k lots), not every listing.</li>
          <li>Sold activity covers recent hours, not full history.</li>
          <li>
            Kill leaderboard uses public kintaramarket.xyz/api/lb (PvP + mob).
          </li>
          <li>Filters &amp; watchlists stay in this browser only.</li>
        </ul>
        <p className="text-[11px] text-muted">
          Run API check below to confirm market + leaderboard health.
        </p>
      </Card>

      <Card className="space-y-3">
        <CardTitle>Accounting</CardTitle>
        <div>
          <Label htmlFor="fee">Default sell fee %</Label>
          <Input
            id="fee"
            value={settings.defaultSellFeePercent}
            onChange={(e) =>
              patchSettings({ defaultSellFeePercent: e.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="mode">Fee target mode</Label>
          <Select
            id="mode"
            value={settings.feeTargetMode}
            onChange={(e) =>
              patchSettings({ feeTargetMode: e.target.value as FeeTargetMode })
            }
          >
            <option value="simple_add">Simple add (×1.05)</option>
            <option value="exact_gross_up">Exact gross-up (÷0.95)</option>
            <option value="off">Off</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={settings.sellAlertsAreNetByDefault}
            onChange={(e) =>
              patchSettings({ sellAlertsAreNetByDefault: e.target.checked })
            }
          />
          Sell alerts are net by default
        </label>
        <div>
          <Label htmlFor="val">Current value method</Label>
          <Select
            id="val"
            value={settings.valuationMethod}
            onChange={(e) =>
              patchSettings({
                valuationMethod: e.target.value as ValuationMethod,
              })
            }
          >
            <option value="manual">Manual</option>
            <option value="lowest_active_listing">Lowest active listing</option>
            <option value="median_cheapest_3">Median cheapest 3</option>
            <option value="median_recent_sales">Median recent sales</option>
            <option value="avg_30d">Avg 30d</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="manualKins">Manual KINS/USD fallback</Label>
          <Input
            id="manualKins"
            value={settings.manualKinsUsd ?? ""}
            onChange={(e) => patchSettings({ manualKinsUsd: e.target.value })}
            placeholder="Only used if live price unavailable"
          />
        </div>
      </Card>

      <Card className="space-y-3">
        <CardTitle>Wallet (optional, public address only)</CardTitle>
        <div>
          <Label htmlFor="wallet">Public Solana address</Label>
          <Input
            id="wallet"
            value={settings.optionalWalletAddress ?? ""}
            onChange={(e) =>
              patchSettings({ optionalWalletAddress: e.target.value })
            }
            placeholder="No seed phrases or private keys"
          />
        </div>
        <p className="text-xs text-muted">
          Never enter a seed phrase or private key. Wallet import is review-only.
        </p>
      </Card>

      <Card className="space-y-3">
        <CardTitle>Favorites</CardTitle>
        <p className="text-xs text-muted">
          {settings.favoriteItemIds.length} favorites · catalog has {items.length}{" "}
          items
        </p>
        <div className="flex flex-wrap gap-2">
          {settings.favoriteItemIds.map((id) => {
            const item = items.find((i) => i.id === id);
            return (
              <button
                key={id}
                type="button"
                className="rounded-full bg-raised px-3 py-1 text-xs text-sky"
                onClick={() =>
                  patchSettings({
                    favoriteItemIds: settings.favoriteItemIds.filter((x) => x !== id),
                  })
                }
              >
                {item?.name ?? id} ×
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-3">
        <CardTitle>Backup</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onExport}>Export JSON</Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Import JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </div>
        {importPreview && (
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
            <p>
              Preview: {importPreview.transactions.length} transactions · exported{" "}
              {importPreview.exportedAt}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  const r = await importBackup(importPreview, "merge");
                  push(`Merged: ${r.imported} imported, ${r.skipped} skipped`, "ok");
                  setImportPreview(null);
                }}
              >
                Merge
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  if (!confirm("Replace all local portfolio data?")) return;
                  const r = await importBackup(importPreview, "replace");
                  push(`Replaced: ${r.imported} imported`, "ok");
                  setImportPreview(null);
                }}
              >
                Replace
              </Button>
              <Button variant="ghost" onClick={() => setImportPreview(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <CardTitle>API status</CardTitle>
        <Button variant="secondary" onClick={checkApis}>
          Refresh API status
        </Button>
        {apiStatus && (
          <pre className="max-h-64 overflow-auto rounded-lg bg-surface-2 p-2 text-xs text-muted">
            {apiStatus}
          </pre>
        )}
      </Card>

      <Card className="space-y-3">
        <CardTitle>Danger zone</CardTitle>
        <Button
          variant="danger"
          onClick={async () => {
            if (
              !confirm(
                "Clear all local portfolio data? Export a backup first if needed.",
              )
            )
              return;
            await wipeData();
            push("Local data cleared", "info");
          }}
        >
          Clear local data
        </Button>
      </Card>

      <Card>
        <CardTitle>Install PWA</CardTitle>
        <p className="mt-2 text-sm text-muted">
          Use your browser&apos;s &quot;Add to Home Screen&quot; / Install app. A
          web manifest is included for offline-friendly local accounting.
        </p>
      </Card>
    </div>
  );
}
