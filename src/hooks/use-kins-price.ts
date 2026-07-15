"use client";

import { useCallback, useEffect, useState } from "react";
import type { KinsPrice } from "@/lib/prices/dexscreener";

type PriceState = {
  price: KinsPrice | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  source?: string;
  updatedAt?: string;
};

export function useKinsPrice(pollMs = 60000) {
  const [state, setState] = useState<PriceState>({
    price: null,
    loading: true,
    error: null,
    stale: false,
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/price/kins", { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean;
        data?: KinsPrice;
        stale?: boolean;
        source?: string;
        updatedAt?: string;
        error?: { message: string };
      };
      if (!json.ok || !json.data) {
        setState((s) => ({
          ...s,
          loading: false,
          error: json.error?.message ?? "Price unavailable",
          stale: true,
        }));
        return;
      }
      setState({
        price: json.data,
        loading: false,
        error: null,
        stale: Boolean(json.stale),
        source: json.source ?? json.data.source,
        updatedAt: json.updatedAt ?? json.data.updatedAt,
      });
    } catch {
      setState((s) => ({
        ...s,
        loading: false,
        error: "Network error loading KINS price",
        stale: true,
      }));
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return { ...state, reload: load };
}
