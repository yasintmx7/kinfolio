import { ok } from "@/lib/api/response";
import { BLOCKED_WRITE_ENDPOINTS } from "@/lib/kintara/official-marketplace";

export const runtime = "nodejs";

export async function GET() {
  return ok(
    {
      status: "ok",
      app: "kinfolio",
      time: new Date().toISOString(),
      features: {
        dexscreener: true,
        coingecko: true,
        helius: Boolean(process.env.HELIUS_API_KEY),
        marketplaceOfficial: true,
        worldEconomy: true,
        wikiIcons: true,
      },
      policy: {
        readOnly: true,
        blockedWriteEndpoints: BLOCKED_WRITE_ENDPOINTS.length,
      },
    },
    { cacheControl: "no-store" },
  );
}
