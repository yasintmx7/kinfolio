"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { KintaraItem } from "@/lib/accounting/types";
import { cn } from "@/lib/utils";
import { Input, Label } from "@/components/ui/input";
import { ItemIcon } from "@/components/items/item-icon";

type Props = {
  items: KintaraItem[];
  value: string;
  onChange: (itemId: string) => void;
  favoriteIds?: string[];
  recentIds?: string[];
  label?: string;
};

export function ItemPicker({
  items,
  value,
  onChange,
  favoriteIds = [],
  recentIds = [],
  label = "Item",
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = items.find((i) => i.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...items];
    if (q) {
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.slug.includes(q) ||
          i.aliases.some((a) => a.toLowerCase().includes(q)),
      );
    }
    return list.sort((a, b) => {
      const af = favoriteIds.includes(a.id) ? 0 : 1;
      const bf = favoriteIds.includes(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      const ar = recentIds.includes(a.id) ? 0 : 1;
      const br = recentIds.includes(b.id) ? 0 : 1;
      if (ar !== br) return ar - br;
      return a.name.localeCompare(b.name);
    });
  }, [items, query, favoriteIds, recentIds]);

  const favItems = favoriteIds
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean) as KintaraItem[];

  const recentItems = recentIds
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean)
    .slice(0, 6) as KintaraItem[];

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      {favItems.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">
            Favorites
          </p>
          <div className="flex flex-wrap gap-1.5">
            {favItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onChange(item.id);
                  setQuery("");
                  setOpen(false);
                }}
                className={cn(
                  "min-h-9 rounded-full px-3 text-xs font-medium transition-colors",
                  value === item.id
                    ? "bg-sky text-[#0a121c]"
                    : "bg-raised text-muted hover:text-primary",
                )}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {recentItems.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">
            Recent
          </p>
          <div className="flex flex-wrap gap-1.5">
            {recentItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onChange(item.id);
                  setQuery("");
                  setOpen(false);
                }}
                className={cn(
                  "min-h-9 rounded-full border border-border px-3 text-xs transition-colors",
                  value === item.id
                    ? "border-sky/50 bg-sky/15 text-sky"
                    : "bg-surface-2 text-muted hover:text-primary",
                )}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          className="pl-9"
          placeholder={selected ? `Search… (selected: ${selected.name})` : "Search items…"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          aria-label="Search items"
        />
      </div>

      {open && (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface-2">
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted">No items match.</p>
          )}
          {filtered.slice(0, 40).map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "flex min-h-11 w-full items-center justify-between px-3 text-left text-sm hover:bg-raised",
                value === item.id && "bg-raised text-sky",
              )}
              onClick={() => {
                onChange(item.id);
                setQuery("");
                setOpen(false);
              }}
            >
              <span className="flex items-center gap-2">
                <ItemIcon
                  itemId={item.id}
                  name={item.name}
                  aliases={item.aliases}
                  imageUrl={item.imageUrl}
                  size={28}
                />
                {favoriteIds.includes(item.id) ? "★ " : ""}
                {item.name}
              </span>
              <span className="text-[10px] capitalize text-muted">{item.category}</span>
            </button>
          ))}
        </div>
      )}

      {selected && !open && (
        <p className="text-xs text-muted">
          Selected: <span className="font-medium text-primary">{selected.name}</span>
        </p>
      )}
    </div>
  );
}
