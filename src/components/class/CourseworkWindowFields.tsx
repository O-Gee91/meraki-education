import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  WINDOW_LABELS,
  formatZoned,
  windowState,
  zoneLabel,
  type WindowState,
} from "@/lib/coursework-window";

/**
 * Start/end window inputs shared by the assignment and assessment forms.
 * Values are wall-clock strings ("YYYY-MM-DDTHH:mm") in the class time zone.
 */
export function CourseworkWindowFields({
  idPrefix,
  timeZone,
  availableFrom,
  closesAt,
  onChange,
}: {
  idPrefix: string;
  timeZone: string;
  availableFrom: string;
  closesAt: string;
  onChange: (next: { availableFrom: string; closesAt: string }) => void;
}) {
  const invalid =
    availableFrom && closesAt && closesAt <= availableFrom
      ? "The end time must be after the start time."
      : null;

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-sm">Availability window (optional)</Label>
        <span className="text-xs text-muted-foreground">Class time ({zoneLabel(timeZone)})</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-start`} className="text-xs font-normal">
            Start time — becomes visible to students
          </Label>
          <Input
            id={`${idPrefix}-start`}
            type="datetime-local"
            value={availableFrom}
            onChange={(e) => onChange({ availableFrom: e.target.value, closesAt })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-end`} className="text-xs font-normal">
            End time — closes for normal hand-in
          </Label>
          <Input
            id={`${idPrefix}-end`}
            type="datetime-local"
            value={closesAt}
            onChange={(e) => onChange({ availableFrom, closesAt: e.target.value })}
          />
        </div>
      </div>
      {invalid ? <p className="text-xs text-destructive">{invalid}</p> : null}
      <p className="text-xs text-muted-foreground">
        The due date is separate — set it however you like; it is never derived from these
        times. Work handed in after the end time is still accepted, flagged late and left out
        of the grade until you choose to count it.
      </p>
    </div>
  );
}

/** Badge that tells staff and students where a piece of work sits in its window. */
export function WindowBadge({
  availableFrom,
  closesAt,
  timeZone,
}: {
  availableFrom: string | null | undefined;
  closesAt: string | null | undefined;
  timeZone: string;
}) {
  if (!availableFrom && !closesAt) return null;
  const state: WindowState = windowState(availableFrom, closesAt);
  const title =
    state === "not_yet"
      ? `Opens ${formatZoned(availableFrom, timeZone)}`
      : state === "closed"
        ? `Closed ${formatZoned(closesAt, timeZone)}`
        : closesAt
          ? `Closes ${formatZoned(closesAt, timeZone)}`
          : `Opened ${formatZoned(availableFrom, timeZone)}`;
  return (
    <Badge
      variant={state === "closed" ? "destructive" : state === "not_yet" ? "outline" : "secondary"}
      title={title}
    >
      {state === "open" ? title : WINDOW_LABELS[state]}
    </Badge>
  );
}

/** Plain-text window summary for staff rows. */
export function WindowSummary({
  availableFrom,
  closesAt,
  timeZone,
}: {
  availableFrom: string | null | undefined;
  closesAt: string | null | undefined;
  timeZone: string;
}) {
  if (!availableFrom && !closesAt) return null;
  return (
    <span className="text-xs text-muted-foreground">
      {availableFrom ? `Opens ${formatZoned(availableFrom, timeZone)}` : "Open now"}
      {closesAt ? ` · Ends ${formatZoned(closesAt, timeZone)}` : ""}
    </span>
  );
}
