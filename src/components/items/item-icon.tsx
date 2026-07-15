"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { resolveWikiItemImage } from "@/lib/kintara/wiki-images";

type Props = {
  itemId?: string;
  name?: string;
  aliases?: string[];
  imageUrl?: string;
  size?: number;
  className?: string;
  /** Larger, clearer art presentation */
  clear?: boolean;
};

/**
 * Item artwork from kintara.wiki with letter fallback.
 */
export function ItemIcon({
  itemId,
  name,
  aliases = [],
  imageUrl,
  size = 48,
  className,
  clear = false,
}: Props) {
  const resolved =
    imageUrl ||
    resolveWikiItemImage(itemId, [...(name ? [name] : []), ...aliases]) ||
    resolveWikiItemImage(name ?? null);

  const [failed, setFailed] = useState(false);
  const showImg = Boolean(resolved) && !failed;
  const initials = (name || itemId || "?")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);

  const box = clear ? Math.max(size, 56) : size;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-surface-2",
        clear
          ? "rounded-2xl border border-border/50 shadow-inner"
          : "rounded-xl border border-border/70",
        className,
      )}
      style={{ width: box, height: box }}
      title={name || itemId}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved}
          alt={name || itemId || "item"}
          width={box}
          height={box}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className={cn(
            "h-full w-full object-contain",
            clear ? "p-1.5" : "p-1",
          )}
          style={{ imageRendering: "auto" }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className={cn(
            "font-semibold tracking-wide text-sky",
            clear ? "text-sm" : "text-[11px]",
          )}
        >
          {initials || "?"}
        </span>
      )}
    </div>
  );
}
