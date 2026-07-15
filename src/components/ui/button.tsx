import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "bg-gold text-[#1a1205] hover:bg-gold-hi focus-visible:ring-gold/40",
  secondary:
    "bg-raised text-primary border border-border hover:bg-surface-2",
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
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}
