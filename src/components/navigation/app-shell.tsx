"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  Store,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";

/** Primary: Market tracker first, then calculator, portfolio, inventory */
const PRIMARY_NAV = [
  { href: "/market", label: "Market", icon: Store },
  { href: "/calculator", label: "Calc", icon: Calculator },
  { href: "/dashboard", label: "Portfolio", icon: LayoutDashboard },
  { href: "/inventory", label: "Bags", icon: Package },
] as const;

const MORE_NAV = [
  { href: "/add", label: "Log trade", icon: Calculator },
  { href: "/history", label: "History", icon: History },
  { href: "/mining", label: "Mining", icon: Pickaxe },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/about", label: "About", icon: BookOpen },
] as const;

const SIDEBAR_NAV = [
  { href: "/market", label: "Market tracker", icon: Store },
  { href: "/calculator", label: "Calculator", icon: Calculator },
  { href: "/dashboard", label: "Portfolio", icon: LayoutDashboard },
  { href: "/add", label: "Log trade", icon: Calculator },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/history", label: "History", icon: History },
  { href: "/mining", label: "Mining", icon: Pickaxe },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/about", label: "About", icon: BookOpen },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_NAV.some((item) => isActive(pathname, item.href));

  return (
    <div className="min-h-dvh bg-app text-primary">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[15.5rem] border-r border-border/80 bg-surface/90 backdrop-blur-sm md:flex md:flex-col">
        <div className="border-b border-border/80 px-4 py-5">
          <Link href="/market" className="block">
            <Logo size={40} priority />
          </Link>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            Live floors, sales &amp; a clean profit calculator for Kintara.
          </p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {SIDEBAR_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sky/15 text-sky-hi ring-1 ring-sky/25"
                    : "text-muted hover:bg-surface-2 hover:text-primary",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active && "text-sky")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border/80 p-3 text-[11px] leading-relaxed text-muted">
          Community tool · not affiliated with Kintara
        </div>
      </aside>

      <div className="md:pl-[15.5rem]">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/70 bg-app/85 px-4 py-3 backdrop-blur-md md:hidden">
          <Link href="/market">
            <Logo size={32} />
          </Link>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-5 pb-28 md:px-6 md:py-7 md:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="grid grid-cols-5 gap-0.5 px-1 py-1">
          {PRIMARY_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-medium",
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
              "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-medium",
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
            More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[45] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#0a121c]/70 backdrop-blur-[2px]"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] mx-2 rounded-2xl border border-border bg-surface p-3 shadow-2xl shadow-black/40">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                More
              </p>
              <Logo variant="mark" size={28} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MORE_NAV.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-medium",
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
