export function percent(earned: number, possible: number) {
  if (!possible) return 0;
  return (earned / possible) * 100;
}

export function letterGrade(pct: number) {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

export function gradeTone(pct: number) {
  if (pct >= 80) return "text-success";
  if (pct >= 70) return "text-warning";
  return "text-destructive";
}

export function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value + (value.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const ATTENDANCE_STATUSES = ["present", "tardy", "absent", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function attendanceTone(status: string) {
  switch (status) {
    case "present":
      return "bg-success/15 text-success border-success/30";
    case "tardy":
      return "bg-warning/20 text-warning-foreground border-warning/40";
    case "absent":
      return "bg-destructive/15 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
