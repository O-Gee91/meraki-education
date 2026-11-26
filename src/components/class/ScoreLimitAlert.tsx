import { cn } from "@/lib/utils";

/** Text error for a score field. Announced by screen readers and tied to the input with aria-describedby. */
export function ScoreLimitAlert({
  id,
  message,
  className,
}: {
  id: string;
  message?: string | null | undefined;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className={cn("text-sm font-medium text-destructive", className)}>
      {message}
    </p>
  );
}
