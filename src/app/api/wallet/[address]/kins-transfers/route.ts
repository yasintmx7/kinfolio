import { fail, ok } from "@/lib/api/response";
import { getKinsTransfers } from "@/lib/solana/helius";
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
      "HELIUS_API_KEY is not set. Use pasted alerts for portfolio entries.",
      { status: 503, retryable: false },
    );
  }

  try {
    const result = await getKinsTransfers(address);
    if (!result) {
      return fail("TRANSFERS_UNAVAILABLE", "Could not load transfers.", {
        status: 502,
        retryable: true,
      });
    }
    return ok(
      {
        address,
        transfers: result.transfers,
        note:
          "Transfers do not prove item or quantity. Confirm each entry before saving to your portfolio.",
      },
      { source: result.source, updatedAt: new Date().toISOString() },
    );
  } catch (e) {
    return fail(
      "TRANSFERS_ERROR",
      e instanceof Error ? e.message : "Transfer lookup failed",
      { status: 502, retryable: true },
    );
  }
}
