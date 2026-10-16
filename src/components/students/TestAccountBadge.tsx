import { FlaskConical } from "lucide-react";
import { isTestStudent } from "@/lib/student-sort";

type Maybe = Parameters<typeof isTestStudent>[0];

/** Muted amber pill marking a dummy account that is excluded from class averages. */
export function TestAccountBadge({ student }: { student: Maybe }) {
  if (!isTestStudent(student)) return null;
  return (
    <span
      className="ml-1.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 align-middle text-[10px] font-medium text-muted-foreground"
      title="Demo / test account — not counted in class averages"
    >
      <FlaskConical className="h-3 w-3" aria-hidden />
      Demo / Test Account
    </span>
  );
}
