import Image from "next/image";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** mark = icon only, full = icon + wordmark */
  variant?: "mark" | "full";
  size?: number;
  priority?: boolean;
};

export function Logo({
  className,
  variant = "full",
  size = 36,
  priority = false,
}: Props) {
  if (variant === "mark") {
    return (
      <Image
        src="/brand/logo-mark.svg"
        alt="Kinfolio"
        width={size}
        height={size}
        priority={priority}
        className={cn("shrink-0", className)}
      />
    );
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image
        src="/brand/logo-mark.svg"
        alt=""
        width={size}
        height={size}
        priority={priority}
        className="shrink-0"
      />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[15px] font-semibold tracking-tight text-primary">
          Kinfolio
        </div>
        <div className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-sky">
          Market · Calculator
        </div>
      </div>
    </div>
  );
}
