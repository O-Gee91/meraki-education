/**
 * Availability windows for coursework.
 *
 * Teachers set an optional "available from" and "closes at" moment on
 * assignments and assessments. Both are stored as timestamptz and always
 * entered/displayed in the class's time zone, so teachers and students see the
 * same wall-clock time regardless of the device time zone.
 *
 * The due date is deliberately independent: nothing here derives one from the
 * other.
 */

export const DEFAULT_TIME_ZONE = "Asia/Shanghai";

export function classTimeZone(tz?: string | null) {
  return tz && tz.trim() ? tz : DEFAULT_TIME_ZONE;
}

function parts(ms: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  // Intl can render midnight as "24"
  if (out["hour"] === "24") out["hour"] = "00";
  return out;
}

/** Offset of the zone at that instant, in ms (positive east of UTC). */
function offsetMs(ms: number, timeZone: string) {
  const p = parts(ms, timeZone);
  const asUtc = Date.UTC(
    Number(p["year"]),
    Number(p["month"]) - 1,
    Number(p["day"]),
    Number(p["hour"]),
    Number(p["minute"]),
    Number(p["second"]),
  );
  return asUtc - ms;
}

/** "YYYY-MM-DDTHH:mm" typed in the class zone -> ISO instant. */
export function zonedInputToIso(local: string, timeZone: string): string | null {
  if (!local) return null;
  const naive = Date.parse(`${local.length === 16 ? local : local.slice(0, 16)}:00Z`);
  if (Number.isNaN(naive)) return null;
  // Two passes settle DST boundaries.
  let utc = naive - offsetMs(naive, timeZone);
  utc = naive - offsetMs(utc, timeZone);
  return new Date(utc).toISOString();
}

/** ISO instant -> "YYYY-MM-DDTHH:mm" for a datetime-local input in the class zone. */
export function isoToZonedInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const p = parts(ms, timeZone);
  return `${p["year"]}-${p["month"]}-${p["day"]}T${p["hour"]}:${p["minute"]}`;
}

/** Friendly "15 Sep 2026, 08:30" in the class zone. */
export function formatZoned(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

/** Short zone label, e.g. "GMT+8". */
export function zoneLabel(timeZone: string): string {
  try {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((x) => x.type === "timeZoneName");
    return p?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

export type WindowState = "not_yet" | "open" | "closed";

export function windowState(
  availableFrom: string | null | undefined,
  closesAt: string | null | undefined,
  now: number = Date.now(),
): WindowState {
  if (availableFrom) {
    const start = Date.parse(availableFrom);
    if (!Number.isNaN(start) && now < start) return "not_yet";
  }
  if (closesAt) {
    const end = Date.parse(closesAt);
    if (!Number.isNaN(end) && now > end) return "closed";
  }
  return "open";
}

export const WINDOW_LABELS: Record<WindowState, string> = {
  not_yet: "Not yet available",
  open: "Open",
  closed: "Closed",
};

/**
 * Late = handed in after the close time. With no close time we fall back to the
 * end of the due date in the class zone, so "late" still means something.
 */
export function isLateAt(
  submittedAtMs: number,
  closesAt: string | null | undefined,
  dueDate: string | null | undefined,
  timeZone: string,
): boolean {
  if (closesAt) {
    const end = Date.parse(closesAt);
    if (!Number.isNaN(end)) return submittedAtMs > end;
  }
  if (dueDate) {
    const end = zonedInputToIso(`${dueDate}T23:59`, timeZone);
    if (end) return submittedAtMs > Date.parse(end);
  }
  return false;
}
