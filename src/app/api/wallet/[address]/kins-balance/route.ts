import { fail, ok } from "@/lib/api/response";
import { getKinsBalance } from "@/lib/solana/helius";
import { isValidSolanaAddress } from "@/lib/solana/validation";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ address: string }> },
) {
  const { address } = await context.params;
  if (!isValidSolanaAddress(address)) {
    return fail("INVALID_ADDRESS", "Invalid Solana wallet address.", {
      status: 400,
    });
  }

  if (!process.env.HELIUS_API_KEY) {
    return fail(
      "HELIUS_NOT_CONFIGURED",
      "HELIUS_API_KEY is not set. Paste alerts remain fully supported.",
      { status: 503, retryable: false },
    );
  }

  try {
    const balance = await getKinsBalance(address);
    if (!balance) {
      return fail("BALANCE_UNAVAILABLE", "Could not load KINS balance.", {
        status: 502,
        retryable: true,
      });
    }
    return ok(balance, {
      source: "helius",
      updatedAt: balance.updatedAt,
      cacheControl: "private, max-age=30",
    });
  } catch (e) {
    return fail(
      "BALANCE_ERROR",
      e instanceof Error ? e.message : "Balance lookup failed",
      { status: 502, retryable: true },
    );
  }
}
