import { cn } from "@/lib/utils";

export function Label({
  children,
  htmlFor,
  className,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("mb-1.5 block text-sm font-medium text-muted", className)}
    >
      {children}
    </label>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-primary outline-none ring-gold/30 placeholder:text-muted/70 focus:ring-2",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-32 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-primary outline-none ring-gold/30 placeholder:text-muted/70 focus:ring-2",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-primary outline-none ring-gold/30 focus:ring-2",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
