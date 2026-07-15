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
  /** Larger frame for profile sheet */
  profile?: boolean;
};

/**
 * 16×16 pixel Kintara-style NPC avatar (Willow-like).
 * Crisp nearest-neighbor scale — no soft SVG curves.
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
  const box = profile ? Math.max(size, 80) : size;
  const n = avatar.size; // 16

  const pixels = useMemo(() => {
    const out: { x: number; y: number; fill: string }[] = [];
    const rows = avatar.template;
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y] ?? "";
      for (let x = 0; x < row.length; x++) {
        const fill = pixelColor(row[x] ?? ".", avatar.palette);
        if (fill) out.push({ x, y, fill });
      }
    }
    return out;
  }, [avatar]);

  // checker bg dots for gamey tile floor
  const bgDots = useMemo(() => {
    const dots: { x: number; y: number }[] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if ((x + y) % 4 === 0) dots.push({ x, y });
      }
    }
    return dots;
  }, [n]);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden bg-[#0a121c]",
        profile
          ? "rounded-lg ring-2 ring-sky/35 shadow-lg shadow-sky/10"
          : "rounded-md ring-1 ring-border/60",
        className,
      )}
      style={{
        width: box,
        height: box,
        imageRendering: "pixelated",
      }}
      title={sellerName || (sellerId ? `#${sellerId}` : "Seller")}
      aria-hidden
    >
      <svg
        width={box}
        height={box}
        viewBox={`0 0 ${n} ${n}`}
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
        shapeRendering="crispEdges"
        style={{ imageRendering: "pixelated" }}
      >
        {/* solid game UI bg */}
        <rect width={n} height={n} fill={avatar.palette.bg} />
        {bgDots.map((d) => (
          <rect
            key={`d-${d.x}-${d.y}`}
            x={d.x}
            y={d.y}
            width={1}
            height={1}
            fill={avatar.palette.bgDot}
          />
        ))}
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
