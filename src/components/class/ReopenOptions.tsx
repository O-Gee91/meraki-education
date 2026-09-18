import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export type ReopenSettings = {
  reopen: boolean;
  scope: "zeros" | "all";
  notify: boolean;
};

export const REOPEN_DEFAULTS: ReopenSettings = { reopen: false, scope: "zeros", notify: true };

/**
 * Shown alongside the date fields when editing coursework: lets the teacher
 * clear marks and give students another chance after a date change.
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
      <div className="flex items-start gap-2">
        <Checkbox
          id={`${idPrefix}-reopen`}
          checked={value.reopen}
          onCheckedChange={(checked) => onChange({ ...value, reopen: checked === true })}
        />
        <div className="space-y-0.5">
          <Label htmlFor={`${idPrefix}-reopen`} className="cursor-pointer">
            Give students another chance after this date change
          </Label>
          <p className="text-xs text-muted-foreground">
            Clears the marks below so students can still complete the work. The original score is
            kept in the record for your files.
          </p>
        </div>
      </div>

      {value.reopen && (
        <div className="space-y-2 pl-6">
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
      )}
    </div>
  );
}
