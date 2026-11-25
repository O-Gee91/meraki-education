import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type LatePenaltyForm = {
  penaltyOn: boolean;
  penaltyMode: string;
  penaltyPerDay: string;
  penaltyZeroAfter: string;
};

export const LATE_PENALTY_BLANK: LatePenaltyForm = {
  penaltyOn: false,
  penaltyMode: "percent",
  penaltyPerDay: "5",
  penaltyZeroAfter: "",
};

export function latePenaltyFormFrom(a: {
  late_penalty_enabled?: boolean | null;
  late_penalty_mode?: string | null;
  late_penalty_per_day?: number | null;
  late_penalty_zero_after_days?: number | null;
}): LatePenaltyForm {
  return {
    penaltyOn: Boolean(a.late_penalty_enabled),
    penaltyMode: a.late_penalty_mode === "points" ? "points" : "percent",
    penaltyPerDay: a.late_penalty_per_day == null ? "5" : String(a.late_penalty_per_day),
    penaltyZeroAfter: a.late_penalty_zero_after_days == null ? "" : String(a.late_penalty_zero_after_days),
  };
}

/** Converts the form into assignment columns; throws a readable error on bad input. */
export function latePenaltyColumns(f: Partial<LatePenaltyForm>) {
  if (!f.penaltyOn) return { late_penalty_enabled: false };
  const perDay = Number(f.penaltyPerDay);
  if (!Number.isFinite(perDay) || perDay <= 0) throw new Error("Daily late deduction must be more than 0");
  if (f.penaltyMode !== "points" && perDay > 100) throw new Error("Daily late deduction cannot be over 100%");
  const zero = f.penaltyZeroAfter?.trim() ? Number(f.penaltyZeroAfter) : null;
  if (zero != null && (!Number.isInteger(zero) || zero < 1))
    throw new Error("“Becomes 0 after” must be a whole number of days");
  return {
    late_penalty_enabled: true,
    late_penalty_mode: f.penaltyMode === "points" ? "points" : "percent",
    late_penalty_per_day: perDay,
    late_penalty_zero_after_days: zero,
  };
}

export function LatePenaltyFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: LatePenaltyForm;
  onChange: (next: LatePenaltyForm) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${idPrefix}-on`} className="text-sm">Late penalty for Missing work</Label>
        <Switch
          id={`${idPrefix}-on`}
          checked={value.penaltyOn}
          onCheckedChange={(v) => onChange({ ...value, penaltyOn: v })}
        />
      </div>
      {value.penaltyOn && (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-amt`} className="text-xs text-muted-foreground">Deduct per day</Label>
              <Input
                id={`${idPrefix}-amt`}
                type="number"
                min={0}
                step="any"
                value={value.penaltyPerDay}
                onChange={(e) => onChange({ ...value, penaltyPerDay: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-mode`} className="text-xs text-muted-foreground">Unit</Label>
              <Select value={value.penaltyMode} onValueChange={(v) => onChange({ ...value, penaltyMode: v })}>
                <SelectTrigger id={`${idPrefix}-mode`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">% of full value</SelectItem>
                  <SelectItem value="points">Points</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-zero`} className="text-xs text-muted-foreground">Becomes 0 after (days)</Label>
              <Input
                id={`${idPrefix}-zero`}
                type="number"
                min={1}
                step={1}
                placeholder="Optional"
                value={value.penaltyZeroAfter}
                onChange={(e) => onChange({ ...value, penaltyZeroAfter: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            While marked Missing (M), this work counts as its full value minus the daily deduction
            for each full day after the due date, and as 0 once the day limit is reached. Excused
            marks are never penalized. When you enter a real score, it replaces Missing exactly as
            entered — adjust it yourself if you want a late deduction.
          </p>
        </>
      )}
    </div>
  );
}
