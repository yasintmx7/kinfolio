"use client";

import { useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CalcDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        className="min-h-9 px-2 text-xs text-muted"
        onClick={() => setOpen(true)}
      >
        <HelpCircle className="h-4 w-4" />
        How is this calculated?
      </Button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-primary">
                  How numbers work
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Plain English for the main totals on your dashboard.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-muted hover:bg-raised hover:text-primary"
                onClick={() => setOpen(false)}
                aria-label="Close drawer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm text-muted">
              <Section title="What you spent">
                Money (and KINS) you actually paid when buying items. Taken from
                the USD/KINS amounts in each buy alert — not today&apos;s token price.
              </Section>
              <Section title="Protected cost target">
                Your spent amount with a fee buffer (default 5%) so you know a
                safer break-even. This is display-only and is never mixed into
                actual investment.
              </Section>
              <Section title="Profit after sales">
                For each sale: net received − average cost of the units sold.
                Uses the historical USD/KINS on that sell alert.
              </Section>
              <Section title="What it might be worth now">
                Estimated if you sold inventory at your reference prices after
                the sell fee. Not a guaranteed sale price.
              </Section>
              <Section title="Paper profit / loss">
                Estimated net value now minus what you still have invested in
                remaining inventory.
              </Section>
              <Section title="Weighted average cost">
                Buys and free earned items share one pool per item. Average cost
                = total remaining cost ÷ total remaining quantity.
              </Section>
              <Section title="Sell alerts are net">
                A Kintara &quot;Received&quot; total is treated as already after
                fee. We do not subtract 5% again.
              </Section>
            </div>

            <Button className="mt-5 w-full" onClick={() => setOpen(false)}>
              Got it
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <h3 className="font-medium text-sky">{title}</h3>
      <p className="mt-1 leading-relaxed">{children}</p>
    </div>
  );
}
