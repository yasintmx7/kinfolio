"use client";

import { useMemo } from "react";
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
  /** Larger frame for profile sheet (shop-card style) */
  profile?: boolean;
};

/**
 * Kintara cosmetic-shop style avatar:
 * Minecraft cube character on sky-blue plate (Sheisty / Camo Shorts vibe).
 */
export function SellerAvatar({
  sellerId,
  sellerName,
  size = 40,
  className,
  profile = false,
}: Props) {
  const avatar = useMemo(
    () => sellerPixelAvatar(sellerId, sellerName),
    [sellerId, sellerName],
  );
  const box = profile ? Math.max(size, 88) : size;
  const n = avatar.size; // 32

  const pixels = useMemo(() => {
    const out: { x: number; y: number; fill: string }[] = [];
    const rows = avatar.template;
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y] ?? "";
      for (let x = 0; x < Math.min(row.length, n); x++) {
        const fill = pixelColor(row[x] ?? ".", avatar.palette);
        if (fill) out.push({ x, y, fill });
      }
    }
    return out;
  }, [avatar, n]);

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
        background: avatar.palette.bg,
      }}
      title={sellerName || (sellerId ? `#${sellerId}` : "Seller")}
      aria-hidden
    >
      {/* Outer shop-card frame when profile */}
      {profile && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-inset ring-white/10"
          aria-hidden
        />
      )}
      <svg
        width={box}
        height={box}
        viewBox={`0 0 ${n} ${n}`}
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
        shapeRendering="crispEdges"
        style={{ imageRendering: "pixelated" }}
      >
        <rect width={n} height={n} fill={avatar.palette.bg} />
        {pixels.map((px) => (
          <rect
            key={`${px.x}-${px.y}`}
            x={px.x}
            y={px.y}
            width={1}
            height={1}
            fill={px.fill}
          />
        ))}
      </svg>
    </div>
  );
}
