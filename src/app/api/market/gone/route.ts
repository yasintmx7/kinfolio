import { ok } from "@/lib/api/response";

export const runtime = "nodejs";

/** Reserved for future official endpoint; no third-party sources. */
export async function GET() {
  return ok(
    {
      ids: [],
      count: 0,
      note: "Not used. Official marketplace listings already exclude reserved rows.",
    },
    { source: "kintara.com", updatedAt: new Date().toISOString() },
  );
}
