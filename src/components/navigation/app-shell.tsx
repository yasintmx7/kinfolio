"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Calculator,
  History,
  LayoutDashboard,
  Menu,
  Package,
  Pickaxe,
  Settings,
  Star,
  Store,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";

const MARKET_SIDEBAR = [
  { href: "/market", tab: "overview", label: "Market hub", icon: Store },
  { href: "/market?tab=floors", tab: "floors", label: "Floors", icon: Store },
  { href: "/market?tab=sales", tab: "sales", label: "Live sales", icon: BarChart3 },
  { href: "/market?tab=watch", tab: "watch", label: "Watchlist", icon: Star },
] as const;

const TOOLS_SIDEBAR = [
  { href: "/calculator", label: "Calculator", icon: Calculator },
  { href: "/dashboard", label: "Portfolio books", icon: LayoutDashboard },
  { href: "/add", label: "Log trade", icon: Package },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/history", label: "History", icon: History },
  { href: "/mining", label: "Mining", icon: Pickaxe },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/about", label: "About", icon: BookOpen },
] as const;

const PRIMARY_MOBILE: {
  href: string;
  tab: "overview" | "sales" | "watch";
  label: string;
  icon: typeof Store;
}[] = [
  { href: "/market", tab: "overview", label: "Market", icon: Store },
  { href: "/market?tab=sales", tab: "sales", label: "Sales", icon: BarChart3 },
  { href: "/market?tab=watch", tab: "watch", label: "Watch", icon: Star },
];

const MORE_NAV = [
  { href: "/calculator", label: "Calculator", icon: Calculator },
  { href: "/dashboard", label: "Books", icon: LayoutDashboard },
  { href: "/add", label: "Log trade", icon: Package },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/history", label: "History", icon: History },
  { href: "/mining", label: "Mining", icon: Pickaxe },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/about", label: "About", icon: BookOpen },
] as const;

function pathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "overview";
  const [moreOpen, setMoreOpen] = useState(false);
  const onMarket = pathname.startsWith("/market");
  const moreActive = MORE_NAV.some((item) => pathActive(pathname, item.href));

  return (
    <div className="min-h-dvh bg-app text-primary">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[15.5rem] border-r border-border/80 bg-surface/90 backdrop-blur-sm md:flex md:flex-col">
        <div className="border-b border-border/80 px-4 py-5">
          <Link href="/market" className="block">
            <Logo size={40} priority />
          </Link>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            Floors + live sales in one place. Market first.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky">
            Market · 90%
          </p>
          <nav className="mb-5 space-y-0.5">
            {MARKET_SIDEBAR.map((item) => {
              const active = onMarket && tab === item.tab;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sky/15 text-sky-hi ring-1 ring-sky/25"
                      : "text-muted hover:bg-surface-2 hover:text-primary",
                  )}
                >
                  <Icon className={cn("h-4 w-4", active && "text-sky")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Tools · 10%
          </p>
          <nav className="space-y-0.5">
            {TOOLS_SIDEBAR.map((item) => {
              const active = pathActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-raised text-primary"
                      : "text-muted hover:bg-surface-2 hover:text-primary",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-80" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-border/80 p-3 text-[11px] leading-relaxed text-muted">
          kintaramarket.xyz · kintrade.xyz · kintara.com
          <br />
          Community · not affiliated with Kintara
        </div>
      </aside>

      <div className="md:pl-[15.5rem]">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/70 bg-app/85 px-4 py-3 backdrop-blur-md md:hidden">
          <Link href="/market">
            <Logo size={32} />
          </Link>
          <Link
            href="/calculator"
            className="rounded-lg bg-raised px-2.5 py-1 text-xs font-medium text-muted"
          >
            Calc
          </Link>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-5 pb-28 md:px-6 md:py-7 md:pb-10">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="grid grid-cols-4 gap-0.5 px-1 py-1">
          {PRIMARY_MOBILE.map((item) => {
            const active =
              onMarket &&
              (item.tab === "overview"
                ? tab === "overview"
                : tab === item.tab);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium",
                  active ? "text-sky-hi" : "text-muted",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg",
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
              "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium",
              moreOpen || moreActive ? "text-sky-hi" : "text-muted",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg",
                (moreOpen || moreActive) && "bg-sky/15",
              )}
            >
              {moreOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </span>
            Tools
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[45] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#0a121c]/70"
            aria-label="Close"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] mx-2 rounded-2xl border border-border bg-surface p-3 shadow-2xl">
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted">
              Tools · calc & books
            </p>
            <div className="grid grid-cols-3 gap-2">
              {MORE_NAV.map((item) => {
                const active = pathActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-medium",
                      active
                        ? "border-sky/40 bg-sky/10 text-sky-hi"
                        : "border-border/80 bg-surface-2 text-muted",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
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
