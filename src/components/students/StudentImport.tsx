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
import { supabase } from "@/integrations/supabase/client";

type ParsedRow = {
  first_name: string;
  last_name: string;
  grade_level: number;
  student_number: string | null;
  guardian_email: string | null;
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
  guardian: "guardian_email",
  "guardian email": "guardian_email",
  "parent email": "guardian_email",
  email: "guardian_email",
};

function normalizeRow(raw: Record<string, unknown>): { row?: ParsedRow; error?: string } {
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = HEADER_MAP[String(key).trim().toLowerCase()];
    if (field) mapped[field] = String(value ?? "").trim();
  }
  const first = (mapped["first_name"] ?? "").slice(0, 60);
  const last = (mapped["last_name"] ?? "").slice(0, 60);
  if (first.length < 2 || last.length < 2) return { error: "missing first or last name" };
  const grade = Number(String(mapped["grade_level"] ?? "").replace(/[^\d]/g, ""));
  if (!grade || grade < 1 || grade > 12) return { error: `invalid grade for ${first} ${last}` };
  const email = (mapped["guardian_email"] ?? "").toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: `invalid guardian email for ${first} ${last}` };
  return {
    row: {
      first_name: first,
      last_name: last,
      grade_level: grade,
      student_number: (mapped["student_number"] ?? "").slice(0, 20) || null,
      guardian_email: email.slice(0, 255) || null,
    },
  };
}

export function StudentImport() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);

  const reset = () => {
    setRows([]);
    setProblems([]);
    setFileName("");
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
        const { row, error } = normalizeRow(r);
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
      const { error } = await supabase.from("students").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      toast.success(`Imported ${count} student${count === 1 ? "" : "s"}`);
      queryClient.invalidateQueries({ queryKey: ["students"] });
      setOpen(false);
      reset();
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
      <DialogTrigger asChild>
        <Button variant="outline">Import from Excel</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import students from a spreadsheet</DialogTitle>
          <DialogDescription>
            Upload an .xlsx, .xls or .csv file. The first row should be headers — we recognise
            First name, Last name, Grade, Student ID and Guardian email.
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
                    <th className="p-2">Grade</th>
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
                      <td className="p-2">{r.grade_level}</td>
                      <td className="p-2 text-muted-foreground">{r.student_number ?? "—"}</td>
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

        <DialogFooter>
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
