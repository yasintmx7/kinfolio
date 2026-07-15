"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  Calculator,
  Grid3X3,
  Layers,
  MoreHorizontal,
  Settings,
  Star,
  Store,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";

const NAV = [
  {
    href: "/market?tab=market",
    tab: "market",
    label: "Market",
    icon: Store,
  },
  { href: "/items", tab: null, label: "Items", icon: Grid3X3 },
  { href: "/market?tab=watch", tab: "watch", label: "Watch", icon: Star },
  { href: "/market?tab=floors", tab: "floors", label: "Floors", icon: Layers },
] as const;

const EXTRA = [
  { href: "/calculator", label: "Calculator", icon: Calculator },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") ?? "market";
  const tab =
    rawTab === "listings" ||
    rawTab === "activity" ||
    rawTab === "sales" ||
    !rawTab
      ? "market"
      : rawTab;
  const [moreOpen, setMoreOpen] = useState(false);
  const onMarket = pathname.startsWith("/market");
  const onItems = pathname.startsWith("/items");

  return (
    <div className="min-h-dvh bg-transparent text-primary">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[14rem] border-r border-border/40 bg-surface/70 backdrop-blur-xl md:flex md:flex-col">
        <div className="border-b border-border/30 px-4 py-5">
          <Link href="/market?tab=market" className="block">
            <Logo size={36} priority />
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 px-2.5 py-3">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/60">
            Track
          </p>
          {NAV.map((item) => {
            const active =
              item.tab === null ? onItems : onMarket && tab === item.tab;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-all",
                  active
                    ? "bg-sky/15 text-sky-hi shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sky)_25%,transparent)]"
                    : "text-muted hover:bg-surface-2/80 hover:text-primary",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
                    active
                      ? "bg-sky/20 text-sky-hi"
                      : "bg-raised/50 text-muted group-hover:text-primary",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </span>
                {item.label}
              </Link>
            );
          })}
          <div className="my-3 mx-2 border-t border-border/35" />
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/60">
            Tools
          </p>
          {EXTRA.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-10 items-center gap-3 rounded-2xl px-3 text-[13px] transition-colors",
                  active
                    ? "bg-surface-2 text-primary"
                    : "text-muted/85 hover:bg-surface-2/70 hover:text-muted",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-75" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border/30 px-4 py-4">
          <p className="text-[11px] font-medium text-primary/90">Kinfolio</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted/70">
            Read-only Kintara market · $ floors · live book
          </p>
        </div>
      </aside>

      <div className="md:pl-[14rem]">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/35 bg-app/80 px-4 py-3 backdrop-blur-xl md:hidden">
          <Link href="/market?tab=market">
            <Logo size={30} />
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky/20 bg-sky/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-hi">
            <span className="live-dot" />
            Live
          </span>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-5 pb-28 md:px-8 md:py-7 md:pb-10">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/40 bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-5 px-0.5 py-1">
          {NAV.map((item) => {
            const active =
              item.tab === null ? onItems : onMarket && tab === item.tab;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                  active ? "text-sky-hi" : "text-muted",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-xl",
                    active && "bg-sky/15",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
              moreOpen ? "text-sky-hi" : "text-muted",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-xl",
                moreOpen && "bg-sky/15",
              )}
            >
              {moreOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <MoreHorizontal className="h-5 w-5" />
              )}
            </span>
            More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[45] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Close"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] rounded-2xl border border-border/60 bg-surface/95 p-2 shadow-2xl backdrop-blur-xl">
            {EXTRA.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm text-primary hover:bg-surface-2"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-raised/60">
                    <Icon className="h-4 w-4 text-sky-hi" />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-app p-6 text-sm text-muted">Loading…</div>
      }
    >
      <ShellInner>{children}</ShellInner>
    </Suspense>
  );
}
