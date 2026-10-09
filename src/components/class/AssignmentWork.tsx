import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Download,
  Inbox,
  MessageSquareText,
  Paperclip,
  RotateCcw,
  Search,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/school";
import { ProofreadEditor, ProofreadNotes } from "@/components/class/ProofreadPanel";
import {
  QuickScoreBar,
  QuickScoreEditButton,
  useClassGradingSetup,
} from "@/components/class/QuickScoreBar";
import { RubricScorePanel } from "@/components/class/RubricScorePanel";
import { LateOverrideControl, LateOverrideBadge } from "@/components/class/LateOverride";
import { StudentSortControl, useStudentSort } from "@/components/students/StudentSortControl";
import { sortStudents } from "@/lib/student-sort";
import { DraftStatus, readDraft, useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import { DEFAULT_TIME_ZONE } from "@/lib/coursework-window";
import { shouldAutoFlag } from "@/lib/assignment-status";
import {
  findMark,
  isAutoGradeComment,
  markCodeFromComment,
  parseGradingSetup,
  quickScoreCellValue,
  type SpecialMark,
} from "@/lib/grading";

const BUCKET = "school-files";
const MAX_BYTES = 25 * 1024 * 1024;

type SubmissionRow = {
  id: string;
  assignment_id: string;
  student_id: string;
  body: string | null;
  file_upload_id: string | null;
  status: string;
  teacher_note: string | null;
  submitted_at: string;
  is_late: boolean;
  late_override_by: string | null;
  late_override_at: string | null;
  late_override_reason: string | null;
  late_penalty_override_pct: number | null;
  file_uploads: { id: string; file_name: string; storage_path: string } | null;
};

type Student = { id: string; first_name: string; last_name: string };

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
}

function useSubmissions(assignmentId: string) {
  return useQuery({
    queryKey: ["assignment-submissions", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select(
          "id, assignment_id, student_id, body, file_upload_id, status, teacher_note, submitted_at, is_late, late_override_by, late_override_at, late_override_reason, late_penalty_override_pct, file_uploads(id, file_name, storage_path)",
        )
        .eq("assignment_id", assignmentId);
      if (error) throw error;
      return (data ?? []) as unknown as SubmissionRow[];
    },
  });
}

async function openFile(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error || !data?.signedUrl) {
    toast.error("Could not open that file");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

type WorkAssignment = {
  id: string;
  title: string;
  points_possible: number;
  due_date: string | null;
  description: string | null;
  submission_mode: string;
  rubric_id?: string | null;
  created_at?: string | null;
};

export function AssignmentWork({
  assignment,
  classId,
  isStaff,
  roster,
  timeZone = DEFAULT_TIME_ZONE,
}: {
  assignment: WorkAssignment;
  classId: string;
  isStaff: boolean;
  roster: Student[];
  timeZone?: string;
}) {
  if (isStaff) {
    return (
      <StaffCollectPanel
        assignment={assignment}
        roster={roster}
        classId={classId}
        timeZone={timeZone}
      />
    );
  }
  return <StudentWorkPanel assignment={assignment} classId={classId} timeZone={timeZone} />;
}

/* ---------------- student side ---------------- */

function StudentWorkPanel({
  assignment,
  classId,
  timeZone,
}: {
  assignment: WorkAssignment;
  classId: string;
  timeZone: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const draftKey = `assignment:${assignment.id}`;
  const draft = useAutosaveDraft(draftKey, body, { enabled: open, dirty: open && body.trim().length > 0 });

  const { data: me } = useQuery({
    queryKey: ["my-student-record", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: submissions = [] } = useSubmissions(assignment.id);
  const mine = me ? submissions.find((s) => s.student_id === me.id) : undefined;

  const { data: grade } = useQuery({
    queryKey: ["my-grade", assignment.id, me?.id],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("points_earned, comment")
        .eq("assignment_id", assignment.id)
        .eq("student_id", me!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const submit = useMutation({
    mutationFn: async (mode: "draft" | "final") => {
      if (!me) throw new Error("Your account is not linked to a student record yet");
      const file = inputRef.current?.files?.[0];
      if (mode === "final" && !body.trim() && !file && !mine?.file_upload_id)
        throw new Error("Write a response or attach a file before you turn it in");
      if (file && file.size > MAX_BYTES) throw new Error("Files must be 25MB or smaller");

      let fileUploadId: string | null = mine?.file_upload_id ?? null;
      if (file) {
        const path = `assignments/${assignment.id}/${me.id}/${Date.now()}-${safeName(file.name)}`;
        const up = await supabase.storage.from(BUCKET).upload(path, file);
        if (up.error) throw up.error;
        const { data: row, error: fErr } = await supabase
          .from("file_uploads")
          .insert({
            class_id: classId,
            student_id: me.id,
            audience: "teachers",
            title: `${assignment.title} — submission`,
            storage_path: path,
            file_name: file.name.slice(0, 200),
            mime_type: file.type || null,
            size_bytes: file.size,
            uploaded_by: user!.id,
          })
          .select("id")
          .single();
        if (fErr) throw fErr;
        fileUploadId = row.id;
      }

      const status = mode === "final" ? "submitted" : "draft";

      if (mine) {
        const { error } = await supabase
          .from("assignment_submissions")
          .update({
            body: body.trim() || null,
            file_upload_id: fileUploadId,
            status: mine.status === "returned" ? mine.status : status,
            submitted_at: new Date().toISOString(),
          })
          .eq("id", mine.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("assignment_submissions").insert({
          assignment_id: assignment.id,
          student_id: me.id,
          body: body.trim() || null,
          file_upload_id: fileUploadId,
          status,
        });
        if (error) throw error;
      }
      return mode;
    },
    onSuccess: (mode) => {
      if (mode === "final") {
        toast.success("Turned in — your teacher can see it now");
        draft.clear();
        setOpen(false);
      } else {
        toast.success("Progress saved — not turned in yet");
      }
      if (inputRef.current) inputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["assignment-submissions", assignment.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scored = grade?.points_earned != null;
  // Teachers type feedback into the score comment; "MARK:xx" is the internal
  // code for special marks and must never be shown as a message.
  const gradeComment =
    grade?.comment && !isAutoGradeComment(grade.comment) ? grade.comment.trim() : "";
  const turnedIn =
    mine != null && (mine.status === "submitted" || mine.status === "collected" || mine.status === "returned");
  const inProgress = mine != null && mine.status === "draft";
  // Lateness is decided by the database (and any teacher override) — never
  // recomputed in the browser, or a teacher's "on time" override wouldn't show.
  const wasLate = turnedIn && Boolean(mine?.is_late);


  if (assignment.submission_mode !== "online") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">
          {assignment.submission_mode === "other" ? "Scored by your teacher" : "Collected in class"}
        </Badge>
        {mine?.status === "collected" || mine?.status === "returned" ? (
          <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
            <CheckCircle2 className="h-3 w-3" /> Checked in by teacher
          </Badge>
        ) : (
          <span className="text-muted-foreground">
            {assignment.submission_mode === "other"
              ? "Nothing to hand in here — your teacher records the score."
              : "Hand this in to your teacher."}
          </span>
        )}
        {scored ? (
          <span className="font-medium">
            Score {String(grade?.points_earned)}/{assignment.points_possible}
          </span>
        ) : null}
        {gradeComment || mine?.teacher_note ? (
          <p className="w-full rounded-md border border-accent/40 bg-accent/5 p-2 text-xs">
            <span className="font-medium">Teacher feedback: </span>
            {gradeComment || mine?.teacher_note}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="outline">Complete online</Badge>
      {turnedIn ? (
        <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
          <CheckCircle2 className="h-3 w-3" /> Turned in {formatDate(mine!.submitted_at.slice(0, 10))}
        </Badge>
      ) : inProgress ? (
        <Badge variant="secondary" className="gap-1">
          <Circle className="h-3 w-3" /> In progress — not turned in
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <Circle className="h-3 w-3" /> Not started
        </Badge>
      )}
      {wasLate ? <Badge variant="destructive">Late</Badge> : null}
      {mine ? <LateOverrideBadge submission={mine} /> : null}
      {gradeComment || mine?.teacher_note ? (
        <Badge className="gap-1 bg-accent text-accent-foreground hover:bg-accent">
          <MessageSquareText className="h-3 w-3" /> Feedback
        </Badge>
      ) : null}
      {scored ? (
        <span className="font-medium">
          Score {String(grade?.points_earned)}/{assignment.points_possible}
        </span>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) {
            const saved = readDraft<string>(`assignment:${assignment.id}`);
            const server = mine?.body ?? "";
            if (saved && saved !== server) {
              setBody(saved);
              toast.info("Restored your autosaved draft — remember to turn it in.");
            } else {
              setBody(server);
            }
          }
        }}
      >
        <DialogTrigger asChild>
          <Button size="sm" variant={mine ? "outline" : "default"} className="h-7">
            {turnedIn ? "View / edit work" : mine ? "Keep working" : "Start assignment"}

          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{assignment.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                turnedIn
                  ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                  : "border-border bg-secondary/40 text-muted-foreground"
              }`}
            >
              {turnedIn ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
              {turnedIn
                ? `Turned in on ${formatDate(mine!.submitted_at.slice(0, 10))}. You can still update it until your teacher grades it.`
                : "Not turned in yet — press “Turn in assignment” when you're finished."}
            </div>
            {assignment.description ? (
              <p className="text-sm text-muted-foreground">{assignment.description}</p>
            ) : null}
            {assignment.rubric_id && me ? (
              <RubricScorePanel
                assignmentId={assignment.id}
                rubricId={assignment.rubric_id}
                studentId={me.id}
                pointsPossible={Number(assignment.points_possible)}
                readOnly
              />
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor={`body-${assignment.id}`}>Your response</Label>
              <Textarea
                id={`body-${assignment.id}`}
                rows={8}
                maxLength={20000}
                value={body}
                disabled={mine?.status === "returned"}
                onChange={(e) => setBody(e.target.value)}
              />
              <DraftStatus
                state={draft.state}
                savedAt={draft.savedAt}
                dirty={body.trim().length > 0}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`file-${assignment.id}`}>Attach a file (optional)</Label>
              <Input id={`file-${assignment.id}`} type="file" ref={inputRef} />
              {mine?.file_uploads ? (
                <button
                  type="button"
                  onClick={() => openFile(mine.file_uploads!.storage_path)}
                  className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  <Paperclip className="h-3 w-3" /> {mine.file_uploads.file_name}
                </button>
              ) : null}
            </div>
            {gradeComment ? (
              <p className="rounded-md border border-accent/40 bg-accent/5 p-3 text-sm">
                <span className="font-medium">Comment with your score: </span>
                {gradeComment}
              </p>
            ) : null}
            {mine?.teacher_note ? (
              <p className="rounded-md bg-secondary/50 p-3 text-sm">
                <span className="font-medium">Teacher feedback: </span>
                {mine.teacher_note}
              </p>
            ) : null}
            {mine ? <ProofreadNotes submissionId={mine.id} /> : null}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => submit.mutate("draft")}
              disabled={submit.isPending || mine?.status === "returned"}
            >
              Save progress
            </Button>
            <Button
              onClick={() => submit.mutate("final")}
              disabled={submit.isPending || mine?.status === "returned"}
            >
              {submit.isPending
                ? "Saving…"
                : turnedIn
                  ? "Update submission"
                  : "Turn in assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


/* ---------------- staff side ---------------- */

function StaffCollectPanel({
  assignment,
  roster,
  classId,
  timeZone,
}: {
  assignment: {
    id: string;
    title: string;
    points_possible: number;
    submission_mode: string;
    due_date?: string | null;
    rubric_id?: string | null;
    created_at?: string | null;
  };
  roster: Student[];
  classId: string;
  timeZone: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [proofreading, setProofreading] = useState<Record<string, boolean>>({});
  // Bulk selection of collected work. Kept in state (not derived) so it survives
  // filtering, sorting and scrolling until the teacher clears it explicitly.
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useStudentSort(`assignment-grading-${classId}`);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  // A score typed into the detail panel but not yet confirmed (blur/Enter) is
  // tracked here so closing the window can't silently discard it.
  const [pendingScore, setPendingScore] = useState<{ studentId: string; value: string } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const { data: submissions = [] } = useSubmissions(assignment.id);


  const { data: setup } = useQuery({
    queryKey: ["grading-setup", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("weights")
        .eq("id", classId)
        .maybeSingle();
      if (error) throw error;
      return parseGradingSetup(data?.weights);
    },
  });
  const marks = setup?.marks ?? [];

  const { data: grades = [] } = useQuery({
    queryKey: ["assignment-grades", assignment.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("id, student_id, points_earned, comment")
        .eq("assignment_id", assignment.id);
      if (error) throw error;
      return data;
    },
  });

  // Online assessments record their hand-ins separately, so count those too or
  // the ledger reports 0 turned in for finished quizzes and tests.
  const { data: assessmentTurnedIn = 0 } = useQuery({
    queryKey: ["assessment-turnins", assignment.id],
    queryFn: async () => {
      const { data: linked, error } = await supabase
        .from("assessments")
        .select("id")
        .eq("assignment_id", assignment.id);
      if (error) throw error;
      const ids = (linked ?? []).map((a) => a.id);
      if (ids.length === 0) return 0;
      const { data: subs, error: sErr } = await supabase
        .from("assessment_submissions")
        .select("student_id")
        .in("assessment_id", ids);
      if (sErr) throw sErr;
      return new Set((subs ?? []).map((s) => s.student_id)).size;
    },
  });


  const check = useMutation({
    mutationFn: async (input: { studentId: string; collected: boolean }) => {
      const existing = submissions.find((s) => s.student_id === input.studentId);
      if (existing) {
        if (!input.collected && existing.status === "collected") {
          const hasStudentWork = Boolean(
            existing.body?.trim() || existing.file_upload_id || existing.teacher_note?.trim(),
          );
          const query = hasStudentWork
            ? supabase
                .from("assignment_submissions")
                .update({ status: "submitted" })
                .eq("id", existing.id)
            : supabase.from("assignment_submissions").delete().eq("id", existing.id);
          const { error } = await query;
          if (error) throw error;
          return;
        }
        const { error } = await supabase
          .from("assignment_submissions")
          .update({ status: input.collected ? "collected" : "submitted" })
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }
      if (!input.collected) return;
      const { error } = await supabase.from("assignment_submissions").insert({
        assignment_id: assignment.id,
        student_id: input.studentId,
        status: "collected",
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["assignment-submissions", assignment.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const startFeedback = useMutation({
    mutationFn: async (studentId: string) => {
      const { error } = await supabase.from("assignment_submissions").insert({
        assignment_id: assignment.id,
        student_id: studentId,
        status: "submitted",
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["assignment-submissions", assignment.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const score = useMutation({
    mutationFn: async (input: { studentId: string; value: string; note?: string }) => {
      const raw = input.value.trim();
      const mark = findMark(raw ? raw.toUpperCase() : null, marks);
      const points = mark || raw === "" ? null : Number(raw);
      if (points != null && (Number.isNaN(points) || points < 0 || points > 10000))
        throw new Error(
          marks.length
            ? `Enter a number or a mark code (${marks.map((m) => m.code).join(", ")})`
            : "Enter a valid score",
        );
      // A written comment must survive a score change: only a special mark
      // replaces the comment, and a number simply clears a previous mark.
      const { data: latestGrade, error: latestGradeError } = await supabase
        .from("grades")
        .select("comment")
        .eq("assignment_id", assignment.id)
        .eq("student_id", input.studentId)
        .maybeSingle();
      if (latestGradeError) throw latestGradeError;
      const previous = latestGrade?.comment ?? null;
      const keptComment = markCodeFromComment(previous) ? null : previous;
      const markComment = mark ? `MARK:${mark.code.toUpperCase()}` : keptComment;
      const { error } = await supabase.from("grades").upsert(
        {
          assignment_id: assignment.id,
          student_id: input.studentId,
          points_earned: points,
          comment: markComment,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "assignment_id,student_id" },
      );
      if (error) throw error;

      // A score means the work was handed in — keep the collected state in sync
      // so teachers never have to tick the box separately.
      const existing = submissions.find((s) => s.student_id === input.studentId);
      if (points != null || mark) {
        if (existing) {
          await supabase
            .from("assignment_submissions")
            .update({ status: "returned" })
            .eq("id", existing.id);
        } else {
          await supabase.from("assignment_submissions").insert({
            assignment_id: assignment.id,
            student_id: input.studentId,
            status: "returned",
          });
        }
      }
    },
    onSuccess: (_data, variables) => {
      toast.success("Score saved");
      setPendingScore((current) =>
        current && current.studentId === variables.studentId ? null : current,
      );
      queryClient.invalidateQueries({ queryKey: ["assignment-grades", assignment.id] });
      queryClient.invalidateQueries({ queryKey: ["assignment-submissions", assignment.id] });
      queryClient.invalidateQueries({ queryKey: ["grades"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cellText = (g?: { points_earned: number | null; comment?: string | null }) => {
    const code = markCodeFromComment(g?.comment);
    if (code) return code;
    return g?.points_earned == null ? "" : String(g.points_earned);
  };

  // One click fills every student (or only the blank ones) with the same score.
  // When rows are selected, only those students are affected.
  const bulkFill = useMutation({
    mutationFn: async (input: { value: string; onlyBlank: boolean; studentIds?: string[] }) => {
      const raw = input.value.trim();
      const mark = findMark(raw ? raw.toUpperCase() : null, marks);
      const points = mark || raw === "" ? null : Number(raw);
      if (points != null && (Number.isNaN(points) || points < 0 || points > 10000))
        throw new Error("Enter a valid score or mark code");

      const scope = input.studentIds?.length
        ? roster.filter((s) => input.studentIds!.includes(s.id))
        : roster;
      const targets = scope.filter((s) => {
        if (!input.onlyBlank) return true;
        const g = grades.find((x) => x.student_id === s.id);
        return cellText(g) === "";
      });
      if (targets.length === 0) throw new Error("Every student already has a score");


      const markComment = mark ? `MARK:${mark.code.toUpperCase()}` : null;
      const stamp = new Date().toISOString();
      const targetIds = targets.map((student) => student.id);
      const { data: latestGrades, error: latestGradesError } = await supabase
        .from("grades")
        .select("student_id, comment")
        .eq("assignment_id", assignment.id)
        .in("student_id", targetIds);
      if (latestGradesError) throw latestGradesError;
      const latestComments = new Map(
        (latestGrades ?? []).map((grade) => [grade.student_id, grade.comment]),
      );
      const keepComment = (studentId: string) => {
        if (markComment) return markComment;
        const previous = latestComments.get(studentId) ?? null;
        return markCodeFromComment(previous) ? null : previous;
      };
      const { error } = await supabase.from("grades").upsert(
        targets.map((s) => ({
          assignment_id: assignment.id,
          student_id: s.id,
          points_earned: points,
          comment: keepComment(s.id),
          updated_at: stamp,
        })),
        { onConflict: "assignment_id,student_id" },
      );
      if (error) throw error;

      if (points != null || mark) {
        const withSub = targets.filter((s) =>
          submissions.some((x) => x.student_id === s.id),
        );
        const withoutSub = targets.filter(
          (s) => !submissions.some((x) => x.student_id === s.id),
        );
        if (withSub.length) {
          await supabase
            .from("assignment_submissions")
            .update({ status: "returned" })
            .eq("assignment_id", assignment.id)
            .in(
              "student_id",
              withSub.map((s) => s.id),
            );
        }
        if (withoutSub.length) {
          await supabase.from("assignment_submissions").insert(
            withoutSub.map((s) => ({
              assignment_id: assignment.id,
              student_id: s.id,
              status: "returned",
            })),
          );
        }
      }
      return targets.length;
    },
    onSuccess: (count) => {
      toast.success(`Filled ${count} student${count === 1 ? "" : "s"}`);
      queryClient.invalidateQueries({ queryKey: ["assignment-grades", assignment.id] });
      queryClient.invalidateQueries({ queryKey: ["assignment-submissions", assignment.id] });
      queryClient.invalidateQueries({ queryKey: ["grades"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const turnedIn = Math.max(
    submissions.filter((s) => s.status !== "draft").length,
    assessmentTurnedIn,
  );


  // One click marks every student who hasn't handed anything in as collected.
  // Scored/returned students are already collected by definition and are skipped.
  const collectAll = useMutation({
    mutationFn: async () => {
      const targets = roster.filter((s) => workState(s.id) === "none");
      if (targets.length === 0) throw new Error("Everyone is already collected");

      const withSub = targets
        .map((s) => submissions.find((x) => x.student_id === s.id))
        .filter((x): x is SubmissionRow => Boolean(x));
      const withoutSub = targets.filter(
        (s) => !submissions.some((x) => x.student_id === s.id),
      );
      // Remember prior statuses so the bulk action can be undone exactly.
      const previous = withSub.map((x) => ({ id: x.id, status: x.status }));
      let insertedIds: string[] = [];
      if (withSub.length) {
        const { data, error } = await supabase
          .from("assignment_submissions")
          .update({ status: "collected" })
          .in("id", withSub.map((x) => x.id))
          .select("id");
        if (error) throw error;
        if ((data ?? []).length !== withSub.length)
          throw new Error("Some students could not be marked collected — check you teach this class");
      }
      if (withoutSub.length) {
        const { data, error } = await supabase
          .from("assignment_submissions")
          .insert(
            withoutSub.map((s) => ({
              assignment_id: assignment.id,
              student_id: s.id,
              status: "collected",
            })),
          )
          .select("id");
        if (error) throw error;
        insertedIds = (data ?? []).map((r) => r.id);
      }
      return { count: targets.length, previous, insertedIds };
    },
    onSuccess: ({ count, previous, insertedIds }) => {
      queryClient.invalidateQueries({ queryKey: ["assignment-submissions", assignment.id] });
      toast.success(`Collected ${count} student${count === 1 ? "" : "s"}`, {
        duration: 10000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              if (insertedIds.length) {
                const { error } = await supabase
                  .from("assignment_submissions")
                  .delete()
                  .in("id", insertedIds)
                  .eq("status", "collected");
                if (error) throw error;
              }
              for (const row of previous) {
                const { error } = await supabase
                  .from("assignment_submissions")
                  .update({ status: row.status })
                  .eq("id", row.id)
                  .eq("status", "collected");
                if (error) throw error;
              }
              toast.success("Collect all undone");
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              queryClient.invalidateQueries({ queryKey: ["assignment-submissions", assignment.id] });
            }
          },
        },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /*
   * Three distinct states, derived only from what was explicitly recorded:
   *  - "graded":    a score or special mark exists
   *  - "collected": the teacher marked it collected (or, for online work, the
   *                 student turned it in) but it has not been graded yet
   *  - "none":      nothing recorded — never inferred or defaulted
   */
  const workState = (studentId: string): "graded" | "missing" | "collected" | "none" => {
    const sub = submissions.find((x) => x.student_id === studentId);
    const g = grades.find((x) => x.student_id === studentId);
    if (markCodeFromComment(g?.comment) === "M") return "missing";
    if (g && (g.points_earned != null || markCodeFromComment(g.comment))) return "graded";
    if (!sub) return "none";
    if (sub.status === "collected") return "collected";
    if (assignment.submission_mode === "online") {
      const hasWork = Boolean(sub.body?.trim() || sub.file_upload_id);
      if ((sub.status === "submitted" || sub.status === "returned") && hasWork) return "collected";
    }
    return "none";
  };

  const collectedCount = roster.filter((s) => workState(s.id) !== "none").length;

  /* ---- bulk selection of collected work ---- */
  const isCollected = (studentId: string) => workState(studentId) !== "none";

  const term = search.trim().toLowerCase();
  const filteredRoster = term
    ? roster.filter((s) =>
        `${s.first_name} ${s.last_name} ${s.last_name} ${s.first_name}`
          .toLowerCase()
          .includes(term),
      )
    : roster;
  const visibleRoster = sortStudents(filteredRoster, sortMode);
  const activeStudent =
    visibleRoster.find((student) => student.id === activeStudentId) ?? visibleRoster[0] ?? null;
  const activeIndex = activeStudent
    ? visibleRoster.findIndex((student) => student.id === activeStudent.id)
    : -1;

  useEffect(() => {
    if (!open || activeStudentId || roster.length === 0) return;
    setActiveStudentId(visibleRoster[0]?.id ?? null);
  }, [activeStudentId, open, visibleRoster]);

  const moveActive = (step: -1 | 1) => {
    if (visibleRoster.length === 0) return;
    // Keyboard navigation skips the input's blur event, so flush a typed score
    // before leaving the student instead of dropping it silently.
    if (pendingScore) {
      score.mutate({ studentId: pendingScore.studentId, value: pendingScore.value });
      setPendingScore(null);
    }
    const nextIndex = Math.min(
      visibleRoster.length - 1,
      Math.max(0, (activeIndex < 0 ? 0 : activeIndex) + step),
    );
    const next = visibleRoster[nextIndex];
    if (!next) return;
    setActiveStudentId(next.id);
    rowRefs.current[next.id]?.scrollIntoView({ block: "nearest" });
  };
  // The master checkbox applies to the currently filtered set only. Every shown
  // student can be selected, whether or not their work is already collected.
  const idsInView = visibleRoster.map((s) => s.id);
  const collectedInView = visibleRoster.filter((s) => isCollected(s.id)).map((s) => s.id);
  const selectedInView = idsInView.filter((id) => selected.includes(id));
  const masterState: boolean | "indeterminate" =
    idsInView.length > 0 && selectedInView.length === idsInView.length
      ? true
      : selectedInView.length > 0
        ? "indeterminate"
        : false;

  const toggleMaster = (next: boolean) => {
    setSelected((prev) =>
      next
        ? Array.from(new Set([...prev, ...idsInView]))
        : prev.filter((id) => !idsInView.includes(id)),
    );
  };

  const toggleRow = (studentId: string, next: boolean) =>
    setSelected((prev) =>
      next ? Array.from(new Set([...prev, studentId])) : prev.filter((id) => id !== studentId),
    );

  // Bulk action: hand the selected collected work back to students. Students
  // with nothing collected yet are simply skipped.
  const returnSelected = useMutation({
    mutationFn: async () => {
      const targets = selected.filter((id) => collectedInView.includes(id) || isCollected(id));
      if (targets.length === 0) throw new Error("Select some collected work first");
      const { error } = await supabase
        .from("assignment_submissions")
        .update({ status: "returned" })
        .eq("assignment_id", assignment.id)
        .in("student_id", targets);
      if (error) throw error;
      return targets.length;
    },
    onSuccess: (count) => {
      toast.success(`Returned ${count} student${count === 1 ? "" : "s"}`);
      queryClient.invalidateQueries({ queryKey: ["assignment-submissions", assignment.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Bulk action: mark every selected student as collected, creating a
  // submission row for anyone who has nothing handed in yet.
  const collectSelected = useMutation({
    mutationFn: async () => {
      const targets = selected.filter((id) => !isCollected(id));
      if (targets.length === 0) throw new Error("Selected students are already collected");
      const withSub = targets.filter((id) => submissions.some((x) => x.student_id === id));
      const withoutSub = targets.filter((id) => !submissions.some((x) => x.student_id === id));
      if (withSub.length) {
        const { error } = await supabase
          .from("assignment_submissions")
          .update({ status: "collected" })
          .eq("assignment_id", assignment.id)
          .in("student_id", withSub);
        if (error) throw error;
      }
      if (withoutSub.length) {
        const { error } = await supabase.from("assignment_submissions").insert(
          withoutSub.map((id) => ({
            assignment_id: assignment.id,
            student_id: id,
            status: "collected",
          })),
        );
        if (error) throw error;
      }
      return targets.length;
    },
    onSuccess: (count) => {
      toast.success(`Marked ${count} student${count === 1 ? "" : "s"} collected`);
      queryClient.invalidateQueries({ queryKey: ["assignment-submissions", assignment.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Reverse an accidental collection without touching scores or real student work.
  // Empty rows created by "Mark collected" are removed; rows containing work or
  // teacher notes return to their prior submitted state.
  const uncollectSelected = useMutation({
    mutationFn: async () => {
      const targets = selected.filter((id) => {
        const submission = submissions.find((row) => row.student_id === id);
        const grade = grades.find((row) => row.student_id === id);
        return submission?.status === "collected" && grade?.points_earned == null;
      });
      if (targets.length === 0) {
        throw new Error("Select collected, unscored students first");
      }

      const emptyIds: string[] = [];
      const submittedIds: string[] = [];
      for (const studentId of targets) {
        const submission = submissions.find((row) => row.student_id === studentId);
        if (!submission) continue;
        const hasStudentWork = Boolean(
          submission.body?.trim() || submission.file_upload_id || submission.teacher_note?.trim(),
        );
        if (hasStudentWork) submittedIds.push(submission.id);
        else emptyIds.push(submission.id);
      }

      if (submittedIds.length) {
        const { error } = await supabase
          .from("assignment_submissions")
          .update({ status: "submitted" })
          .in("id", submittedIds);
        if (error) throw error;
      }
      if (emptyIds.length) {
        const { error } = await supabase
          .from("assignment_submissions")
          .delete()
          .in("id", emptyIds);
        if (error) throw error;
      }
      return targets.length;
    },
    onSuccess: (count) => {
      toast.success(`Unmarked ${count} student${count === 1 ? "" : "s"} as collected`);
      queryClient.invalidateQueries({ queryKey: ["assignment-submissions", assignment.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });



  const scoredCount = roster.filter((student) => {
    const grade = grades.find((row) => row.student_id === student.id);
    return cellText(grade) !== "" && markCodeFromComment(grade?.comment) !== "M";
  }).length;
  const progressCollectedCount = roster.filter((student) => isCollected(student.id)).length;
  const activeSubmission = activeStudent
    ? submissions.find((row) => row.student_id === activeStudent.id)
    : undefined;
  const activeGrade = activeStudent
    ? grades.find((row) => row.student_id === activeStudent.id)
    : undefined;

  const selectStudent = (studentId: string, openDetail = false) => {
    setActiveStudentId(studentId);
    if (openDetail) setShowMobileDetail(true);
  };

  const saveOnEnter = (studentId: string, currentValue: string) =>
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const value = event.currentTarget.value;
      if (value !== currentValue) score.mutate({ studentId, value });
      moveActive(1);
    };



  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="outline">
        {assignment.submission_mode === "online"
          ? "Complete online"
          : assignment.submission_mode === "other"
            ? "Other — scored by teacher"
            : "Collected in class"}
      </Badge>
      {assignment.submission_mode === "collected" ? (
        <>
          <WorkStateBadge
            state="graded"
            label={`${roster.filter((s) => workState(s.id) === "graded").length} graded`}
          />
          {roster.some((s) => workState(s.id) === "missing") ? (
            <WorkStateBadge
              state="missing"
              label={`${roster.filter((s) => workState(s.id) === "missing").length} missing`}
            />
          ) : null}
          <WorkStateBadge
            state="collected"
            label={`${roster.filter((s) => workState(s.id) === "collected").length} collected`}
          />
          <WorkStateBadge
            state="none"
            label={`${roster.filter((s) => workState(s.id) === "none").length} not collected`}
          />
        </>
      ) : (
        <span className="text-muted-foreground">
          {turnedIn}/{roster.length} turned in
        </span>
      )}
      {assignment.submission_mode === "collected" &&
        roster.length > 0 &&
        collectedCount < roster.length && (
          <Button
            size="sm"
            variant="secondary"
            className="h-6 px-2 text-xs"
            disabled={collectAll.isPending}
            onClick={() => collectAll.mutate()}
          >
            Collect all
          </Button>
        )}
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Score not saved yet</AlertDialogTitle>
            <AlertDialogDescription>
              You typed a score for{" "}
              {(() => {
                const student = roster.find((row) => row.id === pendingScore?.studentId);
                return student ? `${student.first_name} ${student.last_name}` : "this student";
              })()}{" "}
              that hasn't been saved. What would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep grading</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setPendingScore(null);
                setConfirmClose(false);
                setOpen(false);
                setShowMobileDetail(false);
              }}
            >
              Close without saving
            </Button>
            <AlertDialogAction
              onClick={() => {
                if (pendingScore) score.mutate({ studentId: pendingScore.studentId, value: pendingScore.value });
                setPendingScore(null);
                setConfirmClose(false);
                setOpen(false);
                setShowMobileDetail(false);
              }}
            >
              Save score & close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && pendingScore) {
            setConfirmClose(true);
            return;
          }
          setOpen(next);
          if (!next) setShowMobileDetail(false);
        }}
      >
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="h-7">
            {assignment.submission_mode === "online"
              ? "Review & score"
              : assignment.submission_mode === "other"
                ? "Score students"
                : "Check in & score"}
          </Button>
        </DialogTrigger>
        <DialogContent
          className="inset-0 left-0 top-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border-0 p-0 sm:rounded-none"
          onKeyDown={(event) => {
            const target = event.target as HTMLElement;
            if (target.matches("input, textarea, button, [role='checkbox']")) return;
            if (event.key === "ArrowUp") {
              event.preventDefault();
              moveActive(-1);
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveActive(1);
            }
          }}
        >
          <header className="shrink-0 border-b border-border bg-background px-4 py-3 pr-14 lg:px-6">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
              <DialogHeader className="min-w-0 space-y-1 text-left">
                <DialogTitle className="truncate text-xl lg:text-2xl">{assignment.title}</DialogTitle>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>{progressCollectedCount} of {roster.length} collected</span>
                  <span>{scoredCount} scored</span>
                  <span>{activeIndex >= 0 ? `Student ${activeIndex + 1} of ${visibleRoster.length}` : "No student selected"}</span>
                </div>
              </DialogHeader>
              <DialogClose asChild>
                <Button variant="outline" size="sm">Close</Button>
              </DialogClose>
            </div>
          </header>

          <div className="shrink-0 border-b border-border bg-background">
            <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 lg:px-6">
              <BulkFillBar
                classId={classId}
                pointsPossible={Number(assignment.points_possible)}
                marks={marks}
                pending={bulkFill.isPending}
                selectedCount={selected.length}
                onFill={(value, onlyBlank) =>
                  bulkFill.mutate({
                    value,
                    onlyBlank,
                    ...(selected.length ? { studentIds: selected } : {}),
                  })
                }
              />
              <QuickScoreEditButton classId={classId} />
            </div>
            <div className="grid gap-2 border-t border-border bg-secondary/30 px-4 py-3 md:grid-cols-[minmax(13rem,1fr)_auto_auto_auto_auto] md:items-center lg:px-6">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-10 pl-9 text-sm"
                  placeholder="Jump to student"
                  aria-label="Jump to student"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <StudentSortControl value={sortMode} onChange={setSortMode} className="w-44" />
              <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
                <Checkbox
                  className="h-5 w-5"
                  checked={masterState}
                  disabled={idsInView.length === 0}
                  onCheckedChange={(value) => toggleMaster(value === true)}
                />
                Select all students
              </label>
              <span className="text-sm text-muted-foreground">
                {selected.length} selected of {idsInView.length} shown
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={selected.length === 0 || collectSelected.isPending}
                  onClick={() => collectSelected.mutate()}
                >
                  Mark collected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selected.length === 0 || uncollectSelected.isPending}
                  onClick={() => uncollectSelected.mutate()}
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  Unmark collected
                </Button>
                <Button

                  size="sm"
                  variant="outline"
                  disabled={selected.length === 0 || returnSelected.isPending}
                  onClick={() => returnSelected.mutate()}
                >
                  Return selected
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={selected.length === 0}
                  onClick={() => setSelected([])}
                >
                  Clear selection
                </Button>
              </div>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(20rem,25rem)_minmax(0,1fr)]">
            <section className={`${showMobileDetail ? "hidden" : "flex"} min-h-0 flex-col border-r-2 border-border bg-secondary/20 lg:flex`}>
              <div className="flex items-center justify-between border-b border-border bg-background px-5 py-3">
                <p className="text-sm font-bold">Student roster</p>
                <p className="text-xs text-muted-foreground">{visibleRoster.length} shown</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label="Students">
                {roster.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No students enrolled yet.</p>
                ) : visibleRoster.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No students match that filter.</p>
                ) : (
                  visibleRoster.map((student, index) => {
                    const submission = submissions.find((row) => row.student_id === student.id);
                    const grade = grades.find((row) => row.student_id === student.id);
                    const collected = isCollected(student.id);
                    const shownScore = cellText(grade);
                    const isActive = activeStudent?.id === student.id;
                    return (
                      <div
                        key={student.id}
                        className={`grid min-h-20 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border border-l-4 px-4 py-3 transition-colors ${
                          isActive
                            ? "border-l-primary bg-primary/10"
                            : `border-l-transparent ${index % 2 ? "bg-secondary/20" : "bg-background"}`
                        } hover:bg-secondary/50`}
                      >
                        <Checkbox
                          checked={selected.includes(student.id)}
                          aria-label={`Select ${student.first_name} ${student.last_name}`}
                          onCheckedChange={(value) => toggleRow(student.id, value === true)}
                        />
                        <Button
                          ref={(node) => { rowRefs.current[student.id] = node; }}
                          type="button"
                          variant="ghost"
                          role="option"
                          aria-selected={isActive}
                          className="h-auto min-w-0 justify-start p-0 text-left hover:bg-transparent"
                          onClick={() => selectStudent(student.id, true)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-lg font-bold leading-tight">
                              {student.last_name}, {student.first_name}
                            </span>
                            <span className="mt-1.5 flex min-h-5 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              {(() => {
                                const online = assignment.submission_mode === "online";
                                const handedInLabel = online ? "Turned in" : "Collected";
                                const state = workState(student.id);
                                if (state === "missing")
                                  return <WorkStateBadge state="missing" label={`${handedInLabel} · Missing`} />;
                                if (state === "graded")
                                  return <WorkStateBadge state="graded" />;
                                if (state === "collected")
                                  return <WorkStateBadge state="collected" label={`${handedInLabel} · not graded`} />;
                                if (!online && submission?.status !== "draft")
                                  return <WorkStateBadge state="none" />;
                                if (submission?.status === "draft")
                                  return <span>In progress</span>;
                                if (online && assignment.due_date) {
                                  // Backdated assignments stay neutral until the
                                  // teacher records a status themselves.
                                  if (shouldAutoFlag(assignment))
                                    return <span className="font-medium text-destructive">Missing</span>;
                                  return assignment.due_date < new Date().toISOString().slice(0, 10)
                                    ? <span>Assigned</span>
                                    : <span>Not due yet</span>;
                                }
                                return <span>Not collected</span>;
                              })()}
                              {submission?.is_late ? (
                                <span className="font-medium text-destructive" title="Handed in after the due date">
                                  · Late
                                </span>
                              ) : submission?.late_override_at ? (
                                <span className="text-muted-foreground" title="Late status overridden by a teacher">· On time (overridden)</span>
                              ) : null}
                            </span>
                          </span>
                        </Button>
                        <div className="flex items-center">
                          <Input
                            key={shownScore}
                            className="h-10 w-20 text-center text-base font-semibold"
                            placeholder={`/${assignment.points_possible}`}
                            defaultValue={shownScore}
                            aria-label={`Score for ${student.first_name} ${student.last_name}`}
                            onFocus={() => selectStudent(student.id)}
                            onKeyDown={saveOnEnter(student.id, shownScore)}
                            onBlur={(event) => {
                              if (event.target.value === shownScore) return;
                              score.mutate({ studentId: student.id, value: event.target.value });
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className={`${showMobileDetail ? "flex" : "hidden"} min-h-0 flex-col bg-background lg:flex`}>
              {activeStudent ? (
                <>
                  <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 lg:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0 lg:hidden"
                        aria-label="Back to student roster"
                        onClick={() => setShowMobileDetail(false)}
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </Button>
                      <div className="min-w-0">
                        <h3 className="truncate text-xl font-semibold">{activeStudent.first_name} {activeStudent.last_name}</h3>
                        <p className="text-sm text-muted-foreground">Student {activeIndex + 1} of {visibleRoster.length}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button size="icon" variant="outline" disabled={activeIndex <= 0} onClick={() => moveActive(-1)} aria-label="Previous student">
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" disabled={activeIndex < 0 || activeIndex >= visibleRoster.length - 1} onClick={() => moveActive(1)} aria-label="Next student">
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-8">
                    <div className="mx-auto max-w-4xl space-y-6">
                      {activeSubmission ? (
                        <LateOverrideControl submission={activeSubmission} assignmentId={assignment.id} />
                      ) : null}
                      <div className="grid gap-4 border-b border-border pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                        <div className="space-y-2">
                          <Label htmlFor={`detail-score-${activeStudent.id}`} className="text-sm">Score</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              key={cellText(activeGrade)}
                              id={`detail-score-${activeStudent.id}`}
                              className="h-11 max-w-32 text-lg"
                              placeholder={`/${assignment.points_possible}`}
                              defaultValue={cellText(activeGrade)}
                              onKeyDown={saveOnEnter(activeStudent.id, cellText(activeGrade))}
                              onChange={(event) => {
                                const value = event.target.value;
                                setPendingScore(
                                  value === cellText(activeGrade)
                                    ? null
                                    : { studentId: activeStudent.id, value },
                                );
                              }}
                              onBlur={(event) => {
                                if (event.target.value === cellText(activeGrade)) return;
                                score.mutate({ studentId: activeStudent.id, value: event.target.value });
                              }}
                            />
                            <span className="text-sm text-muted-foreground">of {assignment.points_possible}</span>
                          </div>
                        </div>
                        {assignment.submission_mode === "collected" ? (
                          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
                            <Checkbox
                              checked={isCollected(activeStudent.id)}
                              disabled={activeGrade?.points_earned != null || check.isPending}
                              onCheckedChange={(value) => check.mutate({ studentId: activeStudent.id, collected: value === true })}
                            />
                            {markCodeFromComment(activeGrade?.comment) === "M"
                              ? "Collected (Missing)"
                              : activeGrade?.points_earned != null
                                ? "Collected (scored)"
                                : "Collected"}
                          </label>
                        ) : null}
                      </div>

                      <div className="border-b border-border pb-5">
                        <QuickScoreBar
                          classId={classId}
                          pointsPossible={Number(assignment.points_possible)}
                          editable={false}
                          label="Quick grade"
                          onPick={(value) => score.mutate({ studentId: activeStudent.id, value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold uppercase text-muted-foreground">Submission</h4>
                        {activeSubmission?.body ? (
                          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap border-l-2 border-primary pl-4 text-base leading-7">
                            {activeSubmission.body}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No typed response submitted.</p>
                        )}
                        {activeSubmission?.file_uploads ? (
                          <Button variant="outline" size="sm" onClick={() => openFile(activeSubmission.file_uploads?.storage_path ?? "")}>
                            <Download className="mr-2 h-4 w-4" /> {activeSubmission.file_uploads.file_name}
                          </Button>
                        ) : null}
                      </div>

                      {assignment.rubric_id ? (
                        <RubricScorePanel
                          key={`${assignment.id}:${activeStudent.id}`}
                          assignmentId={assignment.id}
                          rubricId={assignment.rubric_id}
                          studentId={activeStudent.id}
                          pointsPossible={Number(assignment.points_possible)}
                        />
                      ) : null}

                      {proofreading[activeStudent.id] && activeSubmission ? (
                        <>
                          <ProofreadEditor
                            key={activeSubmission.id}
                            submissionId={activeSubmission.id}
                            body={activeSubmission.body ?? ""}
                            teacherNote={activeSubmission.teacher_note}
                            onNoteSaved={() => queryClient.invalidateQueries({ queryKey: ["assignment-submissions", assignment.id] })}
                          />
                          <Button variant="ghost" size="sm" onClick={() => setProofreading((current) => ({ ...current, [activeStudent.id]: false }))}>
                            Hide proofreading
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setProofreading((current) => ({ ...current, [activeStudent.id]: true }));
                            if (!activeSubmission) startFeedback.mutate(activeStudent.id);
                          }}
                          disabled={startFeedback.isPending}
                        >
                          Proofread & comment
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid flex-1 place-items-center p-8 text-center text-muted-foreground">Select a student to begin grading.</div>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** One-click "fill everyone" toolbar for a whole class. */
function BulkFillBar({
  classId,
  pointsPossible,
  marks,
  pending,
  onFill,
  selectedCount,
}: {
  classId: string;
  pointsPossible: number;
  marks: SpecialMark[];
  pending: boolean;
  onFill: (value: string, onlyBlank: boolean) => void;
  selectedCount: number;
}) {
  const { data: setup } = useClassGradingSetup(classId);
  const [onlyBlank, setOnlyBlank] = useState(true);
  const [custom, setCustom] = useState("");
  const quick = setup?.quickScores ?? [];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-xs font-medium">
          <Users className="h-3.5 w-3.5" />{" "}
          {selectedCount > 0 ? `Fill ${selectedCount} selected` : "Fill all students"}
        </span>

        {quick.map((q, i) => (
          <Button
            key={`${q.label}-${i}`}
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs"
            disabled={pending}
            onClick={() => onFill(quickScoreCellValue(q, pointsPossible), onlyBlank)}
          >
            {q.label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 px-2 text-xs"
          disabled={pending}
          onClick={() => onFill(String(pointsPossible), onlyBlank)}
        >
          Full credit ({pointsPossible})
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-7 w-28 text-xs"
          placeholder={marks.length ? `Score or ${marks[0]?.code}` : "Score"}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={pending || !custom.trim()}
          onClick={() => onFill(custom, onlyBlank)}
        >
          Apply to all
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={onlyBlank} onCheckedChange={(v) => setOnlyBlank(!!v)} />
          Only students without a score
        </label>
      </div>
    </div>
  );
}

/** Distinct, label-plus-icon status pill: Not collected / Collected / Missing / Graded. */
function WorkStateBadge({
  state,
  label,
}: {
  state: "graded" | "missing" | "collected" | "none";
  label?: string;
}) {
  if (state === "graded")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/15 px-2 py-0.5 font-medium text-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
        {label ?? "Graded"}
      </span>
    );
  if (state === "missing")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warning/60 bg-warning/20 px-2 py-0.5 font-medium text-foreground">
        <TriangleAlert className="h-3.5 w-3.5 text-warning-foreground" aria-hidden />
        {label ?? "Missing"}
      </span>
    );
  if (state === "collected")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-medium text-foreground">
        <Inbox className="h-3.5 w-3.5 text-primary" aria-hidden />
        {label ?? "Collected · not graded"}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground">
      <Circle className="h-3.5 w-3.5" aria-hidden />
      {label ?? "Not collected"}
    </span>
  );
}
