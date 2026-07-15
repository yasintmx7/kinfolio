import { KINS_MINT } from "@/config/kintara";
import { fetchWithTimeout } from "@/lib/api/cache";
import { isValidSolanaAddress } from "@/lib/solana/validation";

export type KinsBalance = {
  address: string;
  mint: string;
  amount: string;
  uiAmount: number | null;
  decimals: number;
  updatedAt: string;
};

export type KinsTransfer = {
  signature: string;
  timestamp?: number;
  type?: string;
  amount?: string;
  from?: string;
  to?: string;
  raw?: unknown;
};

function heliusRpcUrl(): string | null {
  const key = process.env.HELIUS_API_KEY;
  if (!key) return null;
  return `https://mainnet.helius-rpc.com/?api-key=${key}`;
}

export async function getKinsBalance(address: string): Promise<KinsBalance | null> {
  if (!isValidSolanaAddress(address)) {
    throw new Error("Invalid Solana address");
  }
  const url = heliusRpcUrl();
  if (!url) return null;

  const res = await fetchWithTimeout(url, {
    method: "POST",
    timeoutMs: 10000,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "kins-balance",
      method: "getTokenAccountsByOwner",
      params: [
        address,
        { mint: KINS_MINT },
        { encoding: "jsonParsed" },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Helius RPC error: ${res.status}`);
  const json = (await res.json()) as {
    result?: {
      value?: Array<{
        account?: {
          data?: {
            parsed?: {
              info?: {
                tokenAmount?: {
                  amount?: string;
                  uiAmount?: number | null;
                  decimals?: number;
                };
              };
            };
          };
        };
      }>;
    };
  };

  const accounts = json.result?.value ?? [];
  let amount = "0";
  let uiAmount: number | null = 0;
  let decimals = 6;

  for (const acc of accounts) {
    const ta = acc.account?.data?.parsed?.info?.tokenAmount;
    if (ta?.amount) {
      amount = String(BigInt(amount) + BigInt(ta.amount));
      uiAmount = (uiAmount ?? 0) + (ta.uiAmount ?? 0);
      decimals = ta.decimals ?? decimals;
    }
  }

  return {
    address,
    mint: KINS_MINT,
    amount,
    uiAmount,
    decimals,
    updatedAt: new Date().toISOString(),
  };
}

export async function getKinsTransfers(
  address: string,
): Promise<{ transfers: KinsTransfer[]; source: string } | null> {
  if (!isValidSolanaAddress(address)) {
    throw new Error("Invalid Solana address");
  }
  const key = process.env.HELIUS_API_KEY;
  if (!key) return null;

  // Legacy enhanced transactions fallback (read-only)
  const url = `https://mainnet.helius-rpc.com/v0/addresses/${address}/transactions?api-key=${key}&limit=50`;
  try {
    const res = await fetchWithTimeout(url, { timeoutMs: 12000 });
    if (!res.ok) {
      return { transfers: [], source: "helius_legacy_unavailable" };
    }
    const json: unknown = await res.json();
    const rows = Array.isArray(json) ? json : [];
    const transfers: KinsTransfer[] = rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        signature: String(r.signature ?? r.txHash ?? ""),
        timestamp: typeof r.timestamp === "number" ? r.timestamp : undefined,
        type: r.type ? String(r.type) : undefined,
        raw: r,
      };
    });
    return { transfers, source: "helius_legacy" };
  } catch {
    return { transfers: [], source: "helius_error" };
  }
}
