import Image from "next/image";
import { Card, CardTitle } from "@/components/ui/card";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-start gap-4">
        <Image
          src="/brand/logo-mark.svg"
          alt="Kinfolio"
          width={56}
          height={56}
          className="rounded-2xl"
        />
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-sky">
            About
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Kinfolio</h1>
          <p className="mt-1 text-sm text-muted">
            Community market tracker &amp; profit calculator for Kintara
          </p>
        </div>
      </div>

      <Card className="space-y-2 text-sm text-muted">
        <CardTitle className="text-primary">What it is</CardTitle>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-primary">Market tracker</strong> — live floors,
            official 30d stats, recent sales
          </li>
          <li>
            <strong className="text-primary">Calculator</strong> — break-even, fee
            targets, KINS↔USD, profit preview
          </li>
          <li>
            <strong className="text-primary">Portfolio books</strong> — paste alerts,
            weighted-average cost, local-only ledger
          </li>
        </ul>
      </Card>

      <Card className="space-y-2 text-sm text-muted">
        <CardTitle className="text-primary">What it is not</CardTitle>
        <ul className="list-disc space-y-1 pl-5">
          <li>Not an official Kintara product</li>
          <li>Not an exchange, wallet, or financial adviser</li>
          <li>No buy / reserve / wallet signing / seed phrases</li>
        </ul>
      </Card>

      <Card className="space-y-2 text-sm text-muted">
        <CardTitle className="text-primary">Brand note</CardTitle>
        <p>
          The Kinfolio mark is an original community brand for this tool. It is not
          the official Kintara logo. Colours take cues from the calm blue/green
          feel of kintara.com.
        </p>
      </Card>

      <Card className="space-y-3 text-sm text-muted">
        <CardTitle className="text-primary">Item artwork</CardTitle>
        <p>
          Item icons are loaded from the community wiki{" "}
          <a
            href="https://kintara.wiki/wiki/Main_Page"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky underline underline-offset-2"
          >
            kintara.wiki
          </a>
          . Thanks to wiki contributors for documenting the game.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://kintara.wiki/custom-assets/kintara_logo_1x.png"
          alt="Kintara Wiki"
          className="h-10 w-auto opacity-90"
          referrerPolicy="no-referrer"
        />
      </Card>

      <Card className="space-y-2 text-sm text-muted">
        <CardTitle className="text-primary">Privacy</CardTitle>
        <p>
          Portfolio data stays in your browser (IndexedDB). Export backups from
          Settings. Clearing site data can erase holdings.
        </p>
      </Card>

      <p className="text-xs text-muted">
        Community-built. Not affiliated with Kintara. Market values are estimates,
        not guaranteed sale prices.
      </p>
    </div>
  );
}
