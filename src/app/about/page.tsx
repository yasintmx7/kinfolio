import { Card, CardTitle } from "@/components/ui/card";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">About</h1>
        <p className="mt-1 text-sm text-muted">
          Kintara Portfolio — community-built, local-first analytics
        </p>
      </div>

      <Card className="space-y-2 text-sm text-muted">
        <CardTitle className="text-primary">What this is</CardTitle>
        <p>
          Paste Kintara transaction alerts, choose the item and quantity, and get
          correct KINS and USD accounting using weighted-average cost — even when
          the KINS price changes.
        </p>
        <p>
          Historical realized profit uses USD amounts from the original alerts.
          Current portfolio value uses live KINS price and your reference item
          prices.
        </p>
      </Card>

      <Card className="space-y-2 text-sm text-muted">
        <CardTitle className="text-primary">What this is not</CardTitle>
        <ul className="list-disc space-y-1 pl-5">
          <li>Not an exchange, wallet, or financial adviser</li>
          <li>Not an official Kintara product</li>
          <li>No wallet signing, buying, listing, or transaction execution</li>
          <li>No seed phrases or private keys ever requested</li>
        </ul>
      </Card>

      <Card className="space-y-2 text-sm text-muted">
        <CardTitle className="text-primary">Privacy</CardTitle>
        <p>
          Portfolio data is stored in your browser (IndexedDB). Clearing site data
          can delete it — export JSON backups regularly. Server routes only proxy
          public price/catalog/market data; they do not store your holdings.
        </p>
      </Card>

      <Card className="space-y-2 text-sm text-muted">
        <CardTitle className="text-primary">Attribution</CardTitle>
        <p>
          Item names reference community knowledge from{" "}
          <a
            className="text-info underline"
            href="https://kintara.wiki/wiki/Category:Items"
            target="_blank"
            rel="noopener noreferrer"
          >
            kintara.wiki
          </a>
          . KINS price via DexScreener (primary) and CoinGecko (fallback).
        </p>
      </Card>

      <p className="text-xs text-muted">
        Community-built portfolio tool. Not affiliated with Kintara. Market values
        are estimates, not guaranteed sale prices.
      </p>
    </div>
  );
}
