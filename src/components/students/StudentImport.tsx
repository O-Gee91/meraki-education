import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { provisionStudentAccounts } from "@/lib/roster.functions";
import { importStudentIdentities } from "@/lib/student-ids.functions";
import { isValidUsername, normalizeUsername, suggestUsername } from "@/lib/usernames";
import { graduatingClassLabel } from "@/lib/academic";
import { AccountResults, type ProvisionedAccount } from "./AccountResults";

type ParsedRow = {
  first_name: string;
  last_name: string;
  grade_level: number;
  student_number: string | null;
  chinese_name: string | null;
  class_name: string | null;
  guardian_email: string | null;
  student_email: string | null;
  student_username: string | null;
  guardian_username: string | null;
};

const HEADER_MAP: Record<string, keyof ParsedRow> = {
  first: "first_name",
  firstname: "first_name",
  "first name": "first_name",
  given: "first_name",
  "given name": "first_name",
  last: "last_name",
  lastname: "last_name",
  "last name": "last_name",
  surname: "last_name",
  "family name": "last_name",
  grade: "grade_level",
  gradelevel: "grade_level",
  "grade level": "grade_level",
  year: "grade_level",
  id: "student_number",
  "student id": "student_number",
  studentid: "student_number",
  "student number": "student_number",
  chinese: "chinese_name",
  "chinese name": "chinese_name",
  "中文名": "chinese_name",
  "中文姓名": "chinese_name",
  class: "class_name",
  "class name": "class_name",
  classname: "class_name",
  homeroom: "class_name",
  guardian: "guardian_email",
  "student email": "student_email",
  studentemail: "student_email",
  "school email": "student_email",
  "guardian email": "guardian_email",
  "parent email": "guardian_email",
  email: "guardian_email",
  username: "student_username",
  "student username": "student_username",
  "student login": "student_username",
  "guardian username": "guardian_username",
  "parent username": "guardian_username",
};

function normalizeRow(
  raw: Record<string, unknown>,
  fallbackGrade?: number | null,
): { row?: ParsedRow; error?: string } {
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = HEADER_MAP[String(key).trim().toLowerCase()];
    if (field) mapped[field] = String(value ?? "").trim();
  }
  const first = (mapped["first_name"] ?? "").slice(0, 60);
  const last = (mapped["last_name"] ?? "").slice(0, 60);
  if (first.length < 2 || last.length < 2) return { error: "missing first or last name" };
  const grade =
    Number(String(mapped["grade_level"] ?? "").replace(/[^\d]/g, "")) || fallbackGrade || 0;
  if (!grade || grade < 1 || grade > 12) return { error: `invalid grade for ${first} ${last}` };

  const email = (mapped["guardian_email"] ?? "").toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: `invalid guardian email for ${first} ${last}` };
  const studentUsername = normalizeUsername(mapped["student_username"] ?? "");
  if (studentUsername && !isValidUsername(studentUsername))
    return { error: `invalid student username for ${first} ${last}` };
  const guardianUsername = normalizeUsername(mapped["guardian_username"] ?? "");
  if (guardianUsername && !isValidUsername(guardianUsername))
    return { error: `invalid guardian username for ${first} ${last}` };
  const studentEmail = (mapped["student_email"] ?? "").toLowerCase();
  if (studentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail))
    return { error: `invalid student email for ${first} ${last}` };
  return {
    row: {
      first_name: first,
      last_name: last,
      grade_level: grade,
      student_number: (mapped["student_number"] ?? "").slice(0, 40) || null,
      chinese_name: (mapped["chinese_name"] ?? "").slice(0, 120) || null,
      class_name: (mapped["class_name"] ?? "").slice(0, 120) || null,
      guardian_email: email.slice(0, 255) || null,
      student_email: studentEmail.slice(0, 255) || null,
      student_username: studentUsername || null,
      guardian_username: guardianUsername || null,
    },
  };
}

export function StudentImport({
  classId,
  className,
  gradeLevel,
  open: openProp,
  onOpenChange,
  showTrigger = true,
  triggerLabel = "Import from Excel",
}: {
  classId?: string;
  className?: string | undefined;
  gradeLevel?: number | null | undefined;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  triggerLabel?: string;
} = {}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [createLogins, setCreateLogins] = useState(true);
  const [loginMode, setLoginMode] = useState<"both" | "student" | "parent">("both");

  const [accounts, setAccounts] = useState<ProvisionedAccount[]>([]);
  const provision = useServerFn(provisionStudentAccounts);
  const importIdentities = useServerFn(importStudentIdentities);

  const reset = () => {
    setRows([]);
    setProblems([]);
    setFileName("");
    setAccounts([]);
    if (inputRef.current) inputRef.current.value = "";
  };


  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, { type: "array" });
      const sheetName = book.SheetNames[0];
      if (!sheetName) throw new Error("That workbook has no sheets");
      const sheet = book.Sheets[sheetName]!;
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const good: ParsedRow[] = [];
      const bad: string[] = [];
      raw.forEach((r, i) => {
        const { row, error } = normalizeRow(r, gradeLevel);
        if (row) good.push(row);
        else bad.push(`Row ${i + 2}: ${error}`);
      });
      setFileName(file.name);
      setRows(good);
      setProblems(bad);
      if (good.length === 0) {
        toast.error("No usable rows found — check that columns include first & last name and grade");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file");
      reset();
    } finally {
      setParsing(false);
    }
  };

  const importRows = useMutation({
    mutationFn: async () => {
      if (rows.length === 0) throw new Error("Nothing to import");

      const imported = await importIdentities({
        data: {
          rows: rows.map((row) => ({
            first_name: row.first_name,
            last_name: row.last_name,
            grade_level: row.grade_level,
            student_number: row.student_number,
            chinese_name: row.chinese_name,
            guardian_email: row.guardian_email,
          })),
        },
      });
      const data = imported.students;
      const ids = data.map((student) => student.id);

      if (classId) {
        const { error: enrollError } = await supabase
          .from("enrollments")
          .upsert(
            ids.map((student_id) => ({ class_id: classId, student_id })),
            { onConflict: "class_id,student_id", ignoreDuplicates: true },
          );
        if (enrollError)
          throw new Error(`Students were added but could not be enrolled: ${enrollError.message}`);
      }

      // Enroll students into classes named in the "Class" column (matched by
      // name, case-insensitive, against classes the user can see).
      const classNames = [...new Set(rows.map((r) => r.class_name).filter((n): n is string => !!n))];
      if (classNames.length > 0) {
        const { data: classes, error: classError } = await supabase
          .from("classes")
          .select("id, name");
        if (classError) throw classError;
        const byName = new Map(
          (classes ?? []).map((c) => [c.name.trim().toLowerCase(), c.id] as const),
        );
        const enrollments: { class_id: string; student_id: string }[] = [];
        const unmatched = new Set<string>();
        rows.forEach((row, i) => {
          if (!row.class_name) return;
          const studentId = ids[i];
          const target = byName.get(row.class_name.trim().toLowerCase());
          if (!studentId) return;
          if (!target) {
            unmatched.add(row.class_name);
            return;
          }
          if (classId && target === classId) return; // already enrolled above
          enrollments.push({ class_id: target, student_id: studentId });
        });
        if (enrollments.length > 0) {
          const { error: enrollError } = await supabase
            .from("enrollments")
            .upsert(enrollments, { onConflict: "class_id,student_id", ignoreDuplicates: true });
          if (enrollError) throw enrollError;
        }
        if (unmatched.size > 0) {
          toast.warning(
            `No class matched: ${[...unmatched].slice(0, 5).join(", ")}${unmatched.size > 5 ? "…" : ""}. Those students were imported without a class enrollment.`,
          );
        }
      }




      let created: ProvisionedAccount[] = [];
      if (createLogins && data) {
        const used = new Set<string>();
        const unique = (base: string) => {
          let candidate = base.slice(0, 30);
          let n = 2;
          while (used.has(candidate)) {
            candidate = `${base}${n}`.slice(0, 30);
            n += 1;
          }
          used.add(candidate);
          return candidate;
        };
        const entries = data
          .map((inserted, i) => {
            const base = suggestUsername(inserted.first_name, inserted.last_name);
            return {
              student_id: inserted.id,
              first_name: inserted.first_name,
              last_name: inserted.last_name,
              student_email: loginMode === "parent" ? null : rows[i]?.student_email ?? null,
              // Left blank on purpose — each person registers their own email at first sign-in.
              guardian_email: null,
              student_username:
                loginMode === "parent" || inserted.user_id
                  ? null
                  : unique(rows[i]?.student_username || base),
              guardian_username:
                loginMode === "student" || inserted.guardian_user_id
                  ? null
                  : unique(rows[i]?.guardian_username || `${base}.parent`.slice(0, 30)),
            };
          })
          .filter(
            (e) => e.student_username || e.guardian_username || e.student_email || e.guardian_email,
          );


        if (entries.length > 0) {
          const result = await provision({ data: { entries } });
          created = result.accounts as ProvisionedAccount[];
        }
      }
      const matched = data.filter((student) => student.action === "matched").length;
      return { count: data.length, matched, accounts: created };
    },
    onSuccess: ({ count, matched, accounts: created }) => {
      const matchedNote = matched > 0 ? ` ${matched} matched an existing student ID.` : "";
      toast.success(`Imported ${count} student${count === 1 ? "" : "s"}.${matchedNote}`);
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["roster"] });
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });

      if (created.length > 0) {
        setAccounts(created);
        setRows([]);
      } else {
        setOpen(false);
        reset();
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button variant="outline">{triggerLabel}</Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {className ? `Add students to ${className}` : "Import students from a spreadsheet"}
          </DialogTitle>
          <DialogDescription>
            Upload an .xlsx, .xls or .csv file. The first row should be headers — we recognise
            First name, Last name, Grade, Class, Chinese name, Student ID, Student email, Student
            username, Guardian username and Guardian email. A student ID matches a returning student
            and does not create a second record. Rows without a student ID are new students and
            receive a new ID. A matching name alone is not used. An email address is required for anyone
            who gets a login. A Class column enrolls each student into the class with that exact
            name.
            {classId
              ? " Imported students are enrolled in this class automatically, and rows without a grade use the class grade level."
              : ""}


          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
          className="block w-full cursor-pointer rounded-md border border-border bg-background p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
        />

        {parsing ? <p className="text-sm text-muted-foreground">Reading file…</p> : null}

        {rows.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge>{rows.length} ready</Badge>
              {problems.length > 0 ? (
                <Badge variant="secondary">{problems.length} skipped</Badge>
              ) : null}
              <span className="text-muted-foreground">{fileName}</span>
            </div>
            <div className="max-h-64 overflow-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-2">Student</th>
                    <th className="p-2">Chinese name</th>
                    <th className="p-2">Grade</th>
                    <th className="p-2">Graduating class</th>
                    <th className="p-2">Class</th>
                    <th className="p-2">Student ID</th>
                    <th className="p-2">Guardian email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={`${r.last_name}-${i}`}>
                      <td className="p-2 font-medium">
                        {r.last_name}, {r.first_name}
                      </td>
                      <td className="p-2 text-muted-foreground">{r.chinese_name ?? "—"}</td>
                      <td className="p-2">{r.grade_level}</td>
                      <td className="p-2 text-muted-foreground">
                        {graduatingClassLabel(r.grade_level)}
                      </td>
                      <td className="p-2 text-muted-foreground">{r.class_name ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">{r.student_number ?? "Will be issued"}</td>
                      <td className="p-2 text-muted-foreground">{r.guardian_email ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 50 ? (
              <p className="text-xs text-muted-foreground">
                Showing the first 50 of {rows.length} rows.
              </p>
            ) : null}
            {problems.length > 0 ? (
              <ul className="max-h-24 overflow-auto text-xs text-muted-foreground">
                {problems.slice(0, 20).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {accounts.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Accounts created — copy these before closing</p>
            <AccountResults accounts={accounts} />
          </div>
        ) : null}

        <div className="flex items-start gap-2 rounded-md border border-border p-3">
          <Checkbox
            id="create-logins"
            checked={createLogins}
            onCheckedChange={(v) => setCreateLogins(v === true)}
          />
          <div className="space-y-2">
            <Label htmlFor="create-logins" className="cursor-pointer">
              Create username logins automatically
            </Label>
            <p className="text-xs text-muted-foreground">
              Each account gets a temporary password and is linked to the student profile. Emails
              stay blank until the person registers one at first sign-in.
            </p>
            {createLogins ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {(
                  [
                    ["both", "Student + parent"],
                    ["student", "Student only"],
                    ["parent", "Parent only"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={loginMode === value ? "default" : "outline"}
                    onClick={() => setLoginMode(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>

        </div>

        <DialogFooter>
          {accounts.length > 0 ? (
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Done
            </Button>
          ) : null}
          <Button
            onClick={() => importRows.mutate()}
            disabled={rows.length === 0 || importRows.isPending}
          >
            {importRows.isPending ? "Importing…" : `Import ${rows.length || ""} students`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
