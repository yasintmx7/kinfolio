import { ok } from "@/lib/api/response";
import { isMarketplaceConfigured } from "@/config/kintara-api";
import { BLOCKED_WRITE_ENDPOINTS } from "@/lib/kintara/official-marketplace";

export const runtime = "nodejs";

export async function GET() {
  return ok(
    {
      status: "ok",
      app: "kintara-portfolio",
      time: new Date().toISOString(),
      features: {
        dexscreener: true,
        coingecko: true,
        helius: Boolean(process.env.HELIUS_API_KEY),
        marketplaceCommunity: isMarketplaceConfigured(),
        marketplaceOfficial: true,
        kintradeSales: true,
        worldEconomy: true,
      },
      policy: {
        readOnly: true,
        blockedWriteEndpoints: BLOCKED_WRITE_ENDPOINTS.length,
      },
    },
    { cacheControl: "no-store" },
  );
}
