"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  Activity,
  Calculator,
  Grid3X3,
  Layers,
  MoreHorizontal,
  Settings,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";

const NAV = [
  { href: "/market?tab=sales", tab: "sales", label: "Live", icon: Activity },
  { href: "/market?tab=floors", tab: "floors", label: "Floors", icon: Layers },
  { href: "/items", tab: null, label: "Items", icon: Grid3X3 },
  { href: "/market?tab=watch", tab: "watch", label: "Watch", icon: Star },
] as const;

const EXTRA = [
  { href: "/calculator", label: "Calculator", icon: Calculator },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "sales";
  const [moreOpen, setMoreOpen] = useState(false);
  const onMarket = pathname.startsWith("/market");
  const onItems = pathname.startsWith("/items");

  return (
    <div className="min-h-dvh bg-app text-primary">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[13.5rem] border-r border-border/50 bg-surface/80 md:flex md:flex-col">
        <div className="px-4 py-5">
          <Link href="/market?tab=sales">
            <Logo size={36} priority />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {NAV.map((item) => {
            const active =
              item.tab === null
                ? onItems
                : onMarket && tab === item.tab;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-sky/15 text-sky-hi"
                    : "text-muted hover:bg-surface-2 hover:text-primary",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-90" />
                {item.label}
              </Link>
            );
          })}
          <div className="my-3 mx-2 border-t border-border/40" />
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
                    ? "text-primary"
                    : "text-muted/80 hover:bg-surface-2 hover:text-muted",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <p className="px-4 py-4 text-[10px] leading-relaxed text-muted/70">
          All items A–Z · wiki photos
        </p>
      </aside>

      <div className="md:pl-[13.5rem]">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/40 bg-app/90 px-4 py-3 backdrop-blur-md md:hidden">
          <Link href="/market?tab=sales">
            <Logo size={30} />
          </Link>
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 py-5 pb-28 md:px-8 md:py-8 md:pb-10">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="grid grid-cols-5 px-0.5 py-1">
          {NAV.map((item) => {
            const active =
              item.tab === null
                ? onItems
                : onMarket && tab === item.tab;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                  active ? "text-sky-hi" : "text-muted",
                )}
              >
                <Icon className="h-5 w-5" />
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
            {moreOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <MoreHorizontal className="h-5 w-5" />
            )}
            More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[45] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] rounded-2xl border border-border bg-surface p-2 shadow-xl">
            {EXTRA.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm text-primary hover:bg-surface-2"
                >
                  <Icon className="h-4 w-4 text-muted" />
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
