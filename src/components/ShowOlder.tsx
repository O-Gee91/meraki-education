import { Button } from "@/components/ui/button";

export function ShowOlder({ show, loading, onClick, label = "Show older" }: { show: boolean; loading?: boolean; onClick: () => void; label?: string }) {
  if (!show) return null;
  return (
    <div className="flex justify-center pt-4">
      <Button type="button" variant="ghost" size="sm" onClick={onClick} disabled={loading}>
        {loading ? "Loading…" : label}
      </Button>
    </div>
  );
}
