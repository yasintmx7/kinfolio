"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  History,
  LayoutDashboard,
  Menu,
  Package,
  Pickaxe,
  PlusCircle,
  Settings,
  Store,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/config/kintara";

const PRIMARY_NAV = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/add", label: "Add", icon: PlusCircle },
  { href: "/inventory", label: "Inventory", icon: Package },
] as const;

const MORE_NAV = [
  { href: "/history", label: "History", icon: History },
  { href: "/mining", label: "Mining", icon: Pickaxe },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/market", label: "Market", icon: Store },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/about", label: "About", icon: BookOpen },
] as const;

const ALL_NAV = [...PRIMARY_NAV, ...MORE_NAV];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_NAV.some((item) => isActive(pathname, item.href));

  return (
    <div className="min-h-dvh bg-app text-primary">
      {/* Desktop sidebar — full nav */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 border-r border-border bg-surface md:flex md:flex-col">
        <div className="border-b border-border px-4 py-5">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
            Kintara
          </div>
          <div className="mt-1 text-lg font-semibold text-primary">{APP_NAME}</div>
          <p className="mt-1 text-xs text-muted">
            Track trades, mining, inventory, and real profit.
          </p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {ALL_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-raised text-gold"
                    : "text-muted hover:bg-surface-2 hover:text-primary",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label === "Home" ? "Dashboard" : item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3 text-[11px] leading-relaxed text-muted">
          Community-built portfolio tool. Not affiliated with Kintara.
        </div>
      </aside>

      <div className="md:pl-56">
        <header className="sticky top-0 z-30 border-b border-border bg-app/90 px-4 py-3 backdrop-blur md:hidden">
          <div className="text-sm font-semibold text-gold">{APP_NAME}</div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-4 pb-28 md:px-6 md:py-6 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom: Home · Add · Inventory · More */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-4 gap-1 px-1 py-1">
          {PRIMARY_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px]",
                  active ? "text-gold" : "text-muted",
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
              "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px]",
              moreOpen || moreActive ? "text-gold" : "text-muted",
            )}
          >
            {moreOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            More
          </button>
        </div>
      </nav>

      {/* More sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-[45] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] rounded-t-2xl border border-border bg-surface p-3 shadow-xl">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted">
              More
            </p>
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
                      "flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl border border-border px-2 text-xs",
                      active
                        ? "border-gold/40 bg-gold/10 text-gold"
                        : "bg-surface-2 text-muted",
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
