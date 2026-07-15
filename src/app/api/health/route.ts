import { ok } from "@/lib/api/response";
import { isMarketplaceConfigured } from "@/config/kintara-api";

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
        marketplace: isMarketplaceConfigured(),
      },
    },
    { cacheControl: "no-store" },
  );
}
