import { Button } from "@/components/ui/button";

/** A failed read. Callers use this instead of an empty list, which would look like zero work. */
export function LoadError({ label, onRetry }: { label: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mt-4 border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p>{label}</p>
      {onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 min-h-11"
          onClick={onRetry}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}
