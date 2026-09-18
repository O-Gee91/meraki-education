import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export type ReopenSettings = {
  scope: "zeros" | "all";
  notify: boolean;
};

export const REOPEN_DEFAULTS: ReopenSettings = { scope: "zeros", notify: true };

/**
 * Shown alongside the date fields when editing coursework. Marks are cleared
 * automatically whenever the date moves later; these choices only widen who is
 * included and whether those students get a message.
 */
export function ReopenOptions({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: ReopenSettings;
  onChange: (next: ReopenSettings) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">Moving the date gives students another chance</p>
        <p className="text-xs text-muted-foreground">
          If you push the date later, the marks below are cleared for students with nothing
          handed in, so they can still complete the work. The original score is kept in the
          record for your files.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-all`}
            checked={value.scope === "all"}
            onCheckedChange={(checked) =>
              onChange({ ...value, scope: checked === true ? "all" : "zeros" })
            }
          />
          <Label htmlFor={`${idPrefix}-all`} className="cursor-pointer text-sm font-normal">
            Include everyone without work handed in (not only the students on 0)
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-notify`}
            checked={value.notify}
            onCheckedChange={(checked) => onChange({ ...value, notify: checked === true })}
          />
          <Label htmlFor={`${idPrefix}-notify`} className="cursor-pointer text-sm font-normal">
            Send those students a message
          </Label>
        </div>
      </div>
    </div>
  );
}
