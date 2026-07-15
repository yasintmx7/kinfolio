"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  History,
  LayoutDashboard,
  Package,
  Pickaxe,
  PlusCircle,
  Settings,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/config/kintara";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/add", label: "Add", icon: PlusCircle },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/market", label: "Market", icon: Store },
  { href: "/mining", label: "Mining", icon: Pickaxe },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/about", label: "About", icon: BookOpen },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-app text-primary">
      {/* Desktop sidebar */}
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
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
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
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3 text-[11px] leading-relaxed text-muted">
          Community-built portfolio tool. Not affiliated with Kintara.
        </div>
      </aside>

      {/* Main */}
      <div className="md:pl-56">
        <header className="sticky top-0 z-30 border-b border-border bg-app/90 px-4 py-3 backdrop-blur md:hidden">
          <div className="text-sm font-semibold text-gold">{APP_NAME}</div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-4 pb-28 md:px-6 md:py-6 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-5 gap-1 px-1 py-1">
          {NAV.slice(0, 5).map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[10px]",
                  active ? "text-gold" : "text-muted",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
        <div className="grid grid-cols-4 gap-1 border-t border-border/60 px-1 py-1">
          {NAV.slice(5).map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[10px]",
                  active ? "text-gold" : "text-muted",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
