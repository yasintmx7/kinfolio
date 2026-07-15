"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ItemIcon } from "@/components/items/item-icon";
import { usePortfolioContext } from "@/components/providers/portfolio-provider";
import { CATALOG_META } from "@/data/static-catalog";
import { cn } from "@/lib/utils";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function ItemsPage() {
  const { items } = usePortfolioContext();
  const [q, setQ] = useState("");
  const [letter, setLetter] = useState<string | "all">("all");
  const [category, setCategory] = useState<string>("all");

  const categories = useMemo(() => {
    const s = new Set(items.map((i) => i.category));
    return ["all", ...[...s].sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items
      .filter((i) => {
        if (category !== "all" && i.category !== category) return false;
        const first = i.name.replace(/^[^A-Za-z]+/, "")[0]?.toUpperCase() ?? "#";
        if (letter !== "all" && first !== letter) return false;
        if (!query) return true;
        return (
          i.name.toLowerCase().includes(query) ||
          i.id.includes(query) ||
          i.aliases.some((a) => a.toLowerCase().includes(query))
        );
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }, [items, q, letter, category]);

  const byLetter = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const item of filtered) {
      const L = item.name.replace(/^[^A-Za-z]+/, "")[0]?.toUpperCase() ?? "#";
      const list = map.get(L) ?? [];
      list.push(item);
      map.set(L, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="space-y-5">
      <section className="card-hero rounded-3xl px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-hi/90">
          Catalog
        </p>
        <h1 className="mt-1 text-[1.7rem] font-semibold tracking-tight sm:text-[1.85rem]">
          All items
        </h1>
        <p className="mt-1 text-sm text-muted">
          A–Z · {CATALOG_META.count} items · {CATALOG_META.withImages} wiki
          photos
        </p>
      </section>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search all items…"
        className="field min-h-12"
      />

      {/* A–Z jump */}
      <div className="card-quiet flex flex-wrap gap-1 rounded-2xl p-2">
        <button
          type="button"
          onClick={() => setLetter("all")}
          className={cn(
            "chip min-h-8 min-w-8 px-2 text-xs font-semibold",
            letter === "all" && "chip-active",
          )}
        >
          All
        </button>
        {LETTERS.map((L) => (
          <button
            key={L}
            type="button"
            onClick={() => setLetter(L)}
            className={cn(
              "chip min-h-8 min-w-8 px-0 text-xs font-semibold",
              letter === L && "chip-active",
            )}
          >
            {L}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={cn(
              "chip rounded-full capitalize",
              category === c && "chip-soft-active",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted">{filtered.length} shown</p>

      {byLetter.map(([L, group]) => (
        <section key={L} id={`letter-${L}`} className="space-y-3">
          <h2 className="sticky top-14 z-10 -mx-1 rounded-xl border border-border/30 bg-app/85 px-2.5 py-1.5 text-sm font-semibold text-sky-hi backdrop-blur-md md:top-2">
            {L}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {group.map((item) => (
              <Link
                key={item.id}
                href={`/market?tab=floors&item=${encodeURIComponent(item.id)}`}
                className="card-quiet flex flex-col items-center gap-2.5 rounded-3xl p-4 text-center transition-all hover:-translate-y-0.5 hover:border-sky/40 hover:shadow-[0_10px_28px_color-mix(in_srgb,#000_25%,transparent)]"
              >
                <ItemIcon
                  itemId={item.id}
                  name={item.name}
                  aliases={item.aliases}
                  imageUrl={item.imageUrl}
                  size={88}
                  clear
                />
                <div className="w-full">
                  <div className="line-clamp-2 text-[13px] font-semibold leading-snug">
                    {item.name}
                  </div>
                  <div className="mt-0.5 text-[11px] capitalize text-muted">
                    {item.category}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {!filtered.length && (
        <div className="card-quiet empty-state rounded-3xl">No items match.</div>
      )}

      <p className="pt-4 text-center text-[11px] text-muted">
        Photos from{" "}
        <a
          href="https://kintara.wiki/wiki/Main_Page"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky underline"
        >
          kintara.wiki
        </a>
      </p>
    </div>
  );
}
