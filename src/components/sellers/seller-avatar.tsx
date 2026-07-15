"use client";

import { memo, useEffect, useMemo, useState } from "react";
import {
  pixelColor,
  sellerPixelAvatar,
} from "@/lib/kintara/seller-avatar";
import { cn } from "@/lib/utils";

type Props = {
  sellerId?: string | null;
  sellerName?: string | null;
  size?: number;
  className?: string;
  profile?: boolean;
};

const DATA_URL_CACHE = new Map<string, string>();
const MAX_CACHE = 250;

function cacheKey(sellerId?: string | null, sellerName?: string | null) {
  return `${sellerId ?? ""}|${sellerName ?? ""}`;
}

function renderAvatarDataUrl(
  sellerId?: string | null,
  sellerName?: string | null,
): string {
  const key = cacheKey(sellerId, sellerName);
  const hit = DATA_URL_CACHE.get(key);
  if (hit) return hit;

  const avatar = sellerPixelAvatar(sellerId, sellerName);
  const n = avatar.size;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = n * scale;
  canvas.height = n * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = avatar.palette.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rows = avatar.template;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < Math.min(row.length, n); x++) {
      const fill = pixelColor(row[x] ?? ".", avatar.palette);
      if (!fill) continue;
      ctx.fillStyle = fill;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }

  const url = canvas.toDataURL("image/png");
  if (DATA_URL_CACHE.size >= MAX_CACHE) {
    const first = DATA_URL_CACHE.keys().next().value;
    if (first != null) DATA_URL_CACHE.delete(first);
  }
  DATA_URL_CACHE.set(key, url);
  return url;
}

/**
 * Kintara shop-style cube avatar — canvas → cached PNG (1 img node, not 500 rects).
 */
export const SellerAvatar = memo(function SellerAvatar({
  sellerId,
  sellerName,
  size = 40,
  className,
  profile = false,
}: Props) {
  const box = profile ? Math.max(size, 88) : size;
  const bg = useMemo(
    () => sellerPixelAvatar(sellerId, sellerName).palette.bg,
    [sellerId, sellerName],
  );
  const [src, setSrc] = useState("");

  useEffect(() => {
    try {
      setSrc(renderAvatarDataUrl(sellerId, sellerName));
    } catch {
      setSrc("");
    }
  }, [sellerId, sellerName]);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden",
        profile
          ? "rounded-2xl ring-1 ring-black/40 shadow-lg"
          : "rounded-lg ring-1 ring-border/50",
        className,
      )}
      style={{
        width: box,
        height: box,
        imageRendering: "pixelated",
        background: bg,
      }}
      title={sellerName || (sellerId ? `#${sellerId}` : "Seller")}
      aria-hidden
    >
      {profile && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-inset ring-white/10"
          aria-hidden
        />
      )}
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={box}
          height={box}
          draggable={false}
          className="h-full w-full"
          style={{ imageRendering: "pixelated" }}
        />
      ) : null}
    </div>
  );
});
