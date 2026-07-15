import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "card-quiet rounded-2xl p-4 transition-colors",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "text-[13px] font-medium tracking-wide text-muted",
        className,
      )}
    >
      {children}
    </h3>
  );
}

export function StatValue({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-1.5 font-mono text-xl font-semibold tabular-nums tracking-tight text-primary",
        className,
      )}
    >
      {children}
    </div>
  );
}
