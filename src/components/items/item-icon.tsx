"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  resolveProcessedItemIcon,
  resolveRemoteWikiItemImage,
} from "@/lib/kintara/wiki-images";

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
 * Item artwork — transparent WebP with consistent padding when available.
 * Falls back to wiki remote, then letter initials.
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
  const aliasList = useMemo(
    () => [...(name ? [name] : []), ...aliases],
    [name, aliases],
  );

  const local = resolveProcessedItemIcon(itemId, aliasList);
  const remote =
    resolveRemoteWikiItemImage(itemId, aliasList) ||
    resolveRemoteWikiItemImage(name ?? null);

  const explicitLocal =
    imageUrl && imageUrl.startsWith("/item-icons/") ? imageUrl : undefined;
  const explicitRemote =
    imageUrl && !imageUrl.startsWith("/item-icons/") ? imageUrl : undefined;

  // Prefer local transparent processed icons over white-plate wiki remotes
  const preferred = explicitLocal || local || explicitRemote || remote;

  const [src, setSrc] = useState<string | undefined>(preferred);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(preferred);
    setFailed(false);
  }, [preferred]);

  const showImg = Boolean(src) && !failed;
  const initials = (name || itemId || "?")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);

  const box = clear ? Math.max(size, 56) : size;
  const imgPad = clear ? 2 : 1;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden",
        "bg-transparent",
        clear
          ? "rounded-2xl ring-1 ring-border/40"
          : "rounded-xl ring-1 ring-border/50",
        className,
      )}
      style={{ width: box, height: box }}
      title={name || itemId}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name || itemId || "item"}
          width={box}
          height={box}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
          style={{
            imageRendering: "auto",
            padding: imgPad,
          }}
          onError={() => {
            if (src && local && src === local && remote && remote !== src) {
              setSrc(remote);
              return;
            }
            if (
              src &&
              explicitLocal &&
              src === explicitLocal &&
              remote &&
              remote !== src
            ) {
              setSrc(remote);
              return;
            }
            setFailed(true);
          }}
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
