import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "forest";

const variants: Record<Variant, string> = {
  primary:
    "bg-sky text-[#0a121c] hover:bg-sky-hi focus-visible:ring-sky/40 shadow-sm shadow-sky/10",
  secondary:
    "bg-raised/80 text-primary border border-border hover:bg-surface-2 hover:border-sky/30",
  forest:
    "bg-forest text-[#04120a] hover:bg-forest-hi focus-visible:ring-forest/40",
  danger: "bg-loss/15 text-loss border border-loss/30 hover:bg-loss/25",
  ghost: "bg-transparent text-muted hover:bg-surface-2 hover:text-primary",
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  disabled,
  children,
  onClick,
}: {
  className?: string;
  variant?: Variant;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}
