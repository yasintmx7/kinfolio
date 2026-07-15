"use client";

import { sellerAvatarParts } from "@/lib/kintara/seller-avatar";
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
 * Kintara-style character avatar (deterministic per seller).
 * Official API has no user avatars — this is a procedural adventurer sprite.
 */
export function SellerAvatar({
  sellerId,
  sellerName,
  size = 40,
  className,
  profile = false,
}: Props) {
  const p = sellerAvatarParts(sellerId, sellerName);
  const box = profile ? Math.max(size, 72) : size;
  const uid = `sa-${p.seed}`;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden",
        profile
          ? "rounded-2xl ring-2 ring-sky/40 shadow-lg shadow-sky/10"
          : "rounded-xl ring-1 ring-border/50",
        className,
      )}
      style={{ width: box, height: box }}
      title={sellerName || (sellerId ? `#${sellerId}` : "Seller")}
      aria-hidden
    >
      <svg
        width={box}
        height={box}
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={p.bg} />
            <stop offset="100%" stopColor={p.bg2} />
          </linearGradient>
          <linearGradient id={`${uid}-shine`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Ground plate */}
        <rect width="64" height="64" fill={`url(#${uid}-bg)`} />
        <rect width="64" height="64" fill={`url(#${uid}-shine)`} />

        {/* Soft vignette circle */}
        <circle cx="32" cy="34" r="26" fill="#0a121c" opacity="0.25" />

        {/* Body / tunic */}
        <path
          d="M18 40 C18 34 22 30 32 30 C42 30 46 34 46 40 L48 58 L16 58 Z"
          fill={p.shirt}
        />
        {/* Collar */}
        <path d="M24 32 L32 36 L40 32 L32 30 Z" fill={p.accent} opacity="0.9" />

        {/* Neck */}
        <rect x="28" y="26" width="8" height="6" rx="2" fill={p.skin} />

        {/* Head */}
        <ellipse cx="32" cy="20" rx="11" ry="12" fill={p.skin} />

        {/* Hair styles */}
        {p.hairStyle === 0 && (
          <>
            <ellipse cx="32" cy="12" rx="12" ry="8" fill={p.hair} />
            <path d="M20 18 Q20 10 32 9 Q44 10 44 18 L42 16 Q32 12 22 16 Z" fill={p.hair} />
          </>
        )}
        {p.hairStyle === 1 && (
          <>
            <path d="M20 20 Q20 8 32 7 Q44 8 44 20 L40 14 Q32 10 24 14 Z" fill={p.hair} />
            <rect x="19" y="16" width="4" height="10" rx="2" fill={p.hair} />
            <rect x="41" y="16" width="4" height="10" rx="2" fill={p.hair} />
          </>
        )}
        {p.hairStyle === 2 && (
          <path
            d="M21 22 Q20 9 32 8 Q44 9 43 22 Q40 14 32 13 Q24 14 21 22 Z"
            fill={p.hair}
          />
        )}
        {p.hairStyle === 3 && (
          <>
            <ellipse cx="32" cy="13" rx="11" ry="7" fill={p.hair} />
            <path d="M22 16 L20 28 L24 18 Z" fill={p.hair} />
            <path d="M42 16 L44 28 L40 18 Z" fill={p.hair} />
          </>
        )}

        {/* Eyes */}
        <circle cx="27" cy="20" r="1.6" fill={p.eye} />
        <circle cx="37" cy="20" r="1.6" fill={p.eye} />
        <circle cx="27.5" cy="19.5" r="0.5" fill="#fff" />
        <circle cx="37.5" cy="19.5" r="0.5" fill="#fff" />

        {/* Smile */}
        <path
          d="M28 25 Q32 28 36 25"
          fill="none"
          stroke="#8a5a40"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.7"
        />

        {/* Accessories */}
        {p.accessory === 1 && (
          // bandana
          <path d="M20 16 Q32 12 44 16 L42 20 Q32 17 22 20 Z" fill={p.accent} />
        )}
        {p.accessory === 2 && (
          // hood
          <path
            d="M18 22 Q18 8 32 6 Q46 8 46 22 L42 18 Q32 12 22 18 Z"
            fill={p.shirt}
            opacity="0.95"
          />
        )}
        {p.accessory === 3 && (
          // gold halo / crown rim
          <ellipse
            cx="32"
            cy="8"
            rx="10"
            ry="3"
            fill="none"
            stroke="#e0bc72"
            strokeWidth="2"
          />
        )}

        {/* Belt */}
        <rect x="20" y="44" width="24" height="3" fill="#1a2430" opacity="0.5" />
        <rect x="30" y="43" width="4" height="5" rx="1" fill={p.accent} />
      </svg>
    </div>
  );
}
