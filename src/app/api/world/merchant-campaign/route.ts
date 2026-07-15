import { fail, ok } from "@/lib/api/response";
import { fetchMerchantCampaign } from "@/lib/kintara/official-marketplace";

export const runtime = "nodejs";

/** Public world merchant campaign (no personal session). */
export async function GET() {
  try {
    const data = await fetchMerchantCampaign();
    return ok(data, {
      source: "fanout.kintara.gg",
      updatedAt: new Date().toISOString(),
      cacheControl: "public, s-maxage=45, stale-while-revalidate=120",
    });
  } catch (e) {
    return fail(
      "MERCHANT_CAMPAIGN_ERROR",
      e instanceof Error ? e.message : "Failed to load merchant campaign",
      { status: 502, retryable: true },
    );
  }
}
