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
};

/**
 * Item artwork from kintara.wiki with graceful letter fallback.
 */
export function ItemIcon({
  itemId,
  name,
  aliases = [],
  imageUrl,
  size = 40,
  className,
}: Props) {
  const resolved =
    imageUrl ||
    resolveWikiItemImage(itemId, [
      ...(name ? [name] : []),
      ...aliases,
    ]) ||
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

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-surface-2",
        className,
      )}
      style={{ width: size, height: size }}
      title={name || itemId}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved}
          alt={name || itemId || "item"}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain p-1"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-[11px] font-semibold tracking-wide text-sky">
          {initials || "?"}
        </span>
      )}
    </div>
  );
}
