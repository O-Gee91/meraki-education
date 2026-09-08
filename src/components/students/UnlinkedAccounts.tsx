import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getUnlinkedAccounts, linkSelfRegisteredAccount } from "@/lib/unlinked.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StudentOption = {
  id: string;
  first_name: string;
  last_name: string;
  grade_level: number;
  user_id: string | null;
  guardian_user_id: string | null;
};

const NEW_RECORD = "__new__";

export function UnlinkedAccounts({ students }: { students: StudentOption[] }) {
  const queryClient = useQueryClient();
  const fetchUnlinked = useServerFn(getUnlinkedAccounts);
  const link = useServerFn(linkSelfRegisteredAccount);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["unlinked-accounts"],
    queryFn: () => fetchUnlinked({ data: undefined }),
  });

  const accounts = data?.accounts ?? [];

  const sortedStudents = useMemo(
    () =>
      [...students].sort((a, b) => {
        const last = a.last_name.localeCompare(b.last_name, undefined, { sensitivity: "base" });
        if (last !== 0) return last;
        return a.first_name.localeCompare(b.first_name, undefined, { sensitivity: "base" });
      }),
    [students],
  );

  const attach = useMutation({
    mutationFn: async (account: (typeof accounts)[number]) => {
      const target = targets[account.user_id] ?? (account.role === "student" ? NEW_RECORD : "");
      if (!target) throw new Error("Choose the student record to link this guardian to");
      await link({
        data: {
          user_id: account.user_id,
          role: account.role,
          student_id: target === NEW_RECORD ? null : target,
          grade_level: target === NEW_RECORD ? Number(grades[account.user_id] ?? "7") : null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Account linked to the roster");
      queryClient.invalidateQueries({ queryKey: ["unlinked-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || accounts.length === 0) return null;

  return (
    <div className="panel mt-4 p-4">
      <h2 className="font-display text-base font-semibold">
        Self-registered accounts waiting to be added ({accounts.length})
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        These people created their own login but aren't on the roster yet. Link each one to a student
        record so they appear in classes, attendance and reporting.
      </p>
      <ul className="mt-4 space-y-3">
        {accounts.map((a) => {
          const target = targets[a.user_id] ?? (a.role === "student" ? NEW_RECORD : "");
          return (
            <li
              key={`${a.user_id}-${a.role}`}
              className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3"
            >
              <div className="min-w-40 flex-1">
                <p className="font-medium">{a.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {a.role === "student" ? "Student" : "Parent / guardian"} ·{" "}
                  {a.email ?? "no email on file"}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Link to</Label>
                <Select
                  value={target}
                  onValueChange={(v) => setTargets({ ...targets, [a.user_id]: v })}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Choose student record" />
                  </SelectTrigger>
                  <SelectContent>
                    {a.role === "student" ? (
                      <SelectItem value={NEW_RECORD}>Create a new student record</SelectItem>
                    ) : null}
                    {sortedStudents
                      .filter((s) => (a.role === "student" ? !s.user_id : !s.guardian_user_id))
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.last_name}, {s.first_name} (Gr {s.grade_level})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {target === NEW_RECORD ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">Grade</Label>
                  <Input
                    className="w-20"
                    inputMode="numeric"
                    value={grades[a.user_id] ?? "7"}
                    onChange={(e) => setGrades({ ...grades, [a.user_id]: e.target.value })}
                  />
                </div>
              ) : null}
              <Button onClick={() => attach.mutate(a)} disabled={attach.isPending}>
                Add to roster
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
