import { useEffect, useState } from "react";
import {
  DEFAULT_STUDENT_SORT,
  isStudentSortMode,
  STUDENT_SORT_LABELS,
  type StudentSortMode,
} from "@/lib/student-sort";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function useStudentSort(viewKey: string) {
  const [sortMode, setSortMode] = useState<StudentSortMode>(DEFAULT_STUDENT_SORT);

  useEffect(() => {
    const saved = window.localStorage.getItem(`meraki.student-sort.${viewKey}`);
    if (isStudentSortMode(saved)) setSortMode(saved);
  }, [viewKey]);

  const updateSortMode = (next: StudentSortMode) => {
    setSortMode(next);
    window.localStorage.setItem(`meraki.student-sort.${viewKey}`, next);
  };

  return [sortMode, updateSortMode] as const;
}

export function StudentSortControl({
  value,
  onChange,
  className = "w-52",
}: {
  value: StudentSortMode;
  onChange: (value: StudentSortMode) => void;
  className?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-xs text-muted-foreground">Sorted by:</span>
      <Select value={value} onValueChange={(next) => onChange(next as StudentSortMode)}>
        <SelectTrigger className={className} aria-label="Sort students">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(STUDENT_SORT_LABELS) as StudentSortMode[]).map((mode) => (
            <SelectItem key={mode} value={mode}>
              {STUDENT_SORT_LABELS[mode]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}