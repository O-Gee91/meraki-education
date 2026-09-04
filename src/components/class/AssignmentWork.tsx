import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Circle, Download, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
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
import { QuickScoreBar, QuickScoreEditButton } from "@/components/class/QuickScoreBar";
import { DraftStatus, readDraft, useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import { findMark, markCodeFromComment, parseGradingSetup } from "@/lib/grading";

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
          "id, assignment_id, student_id, body, file_upload_id, status, teacher_note, submitted_at, file_uploads(id, file_name, storage_path)",
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

export function AssignmentWork({
  assignment,
  classId,
  isStaff,
  roster,
}: {
  assignment: {
    id: string;
    title: string;
    points_possible: number;
    due_date: string | null;
    description: string | null;
    submission_mode: string;
  };
  classId: string;
  isStaff: boolean;
  roster: Student[];
}) {
  if (isStaff) {
    return <StaffCollectPanel assignment={assignment} roster={roster} classId={classId} />;
  }
  return <StudentWorkPanel assignment={assignment} classId={classId} />;
}

/* ---------------- student side ---------------- */

function StudentWorkPanel({
  assignment,
  classId,
}: {
  assignment: {
    id: string;
    title: string;
    points_possible: number;
    due_date: string | null;
    description: string | null;
    submission_mode: string;
  };
  classId: string;
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
  const turnedIn =
    mine != null && (mine.status === "submitted" || mine.status === "collected" || mine.status === "returned");
  const inProgress = mine != null && mine.status === "draft";

  if (assignment.submission_mode !== "online") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">Collected in class</Badge>
        {mine?.status === "collected" || mine?.status === "returned" ? (
          <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
            <CheckCircle2 className="h-3 w-3" /> Checked in by teacher
          </Badge>
        ) : (
          <span className="text-muted-foreground">Hand this in to your teacher.</span>
        )}
        {scored ? (
          <span className="font-medium">
            Score {String(grade?.points_earned)}/{assignment.points_possible}
          </span>
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
}: {
  assignment: {
    id: string;
    title: string;
    points_possible: number;
    submission_mode: string;
    due_date?: string | null;
  };
  roster: Student[];
  classId: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [proofreading, setProofreading] = useState<Record<string, boolean>>({});
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

  const check = useMutation({
    mutationFn: async (input: { studentId: string; collected: boolean }) => {
      const existing = submissions.find((s) => s.student_id === input.studentId);
      if (existing) {
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
      const markComment = mark ? `MARK:${mark.code.toUpperCase()}` : null;
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
    onSuccess: () => {
      toast.success("Score saved");
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
  const bulkFill = useMutation({
    mutationFn: async (input: { value: string; onlyBlank: boolean }) => {
      const raw = input.value.trim();
      const mark = findMark(raw ? raw.toUpperCase() : null, marks);
      const points = mark || raw === "" ? null : Number(raw);
      if (points != null && (Number.isNaN(points) || points < 0 || points > 10000))
        throw new Error("Enter a valid score or mark code");

      const targets = roster.filter((s) => {
        if (!input.onlyBlank) return true;
        const g = grades.find((x) => x.student_id === s.id);
        return cellText(g) === "";
      });
      if (targets.length === 0) throw new Error("Every student already has a score");

      const markComment = mark ? `MARK:${mark.code.toUpperCase()}` : null;
      const stamp = new Date().toISOString();
      const { error } = await supabase.from("grades").upsert(
        targets.map((s) => ({
          assignment_id: assignment.id,
          student_id: s.id,
          points_earned: points,
          comment: markComment,
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


  const turnedIn = submissions.filter((s) => s.status !== "draft").length;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="outline">
        {assignment.submission_mode === "online" ? "Complete online" : "Collected in class"}
      </Badge>
      <span className="text-muted-foreground">
        {turnedIn}/{roster.length} turned in
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="h-7">
            {assignment.submission_mode === "online" ? "Review & score" : "Check in & score"}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{assignment.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 rounded-lg border border-border bg-secondary/30 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Quick scores below each student apply instantly — tweak the list to fit this
                assignment.
              </p>
              <QuickScoreEditButton classId={classId} />
            </div>
            <BulkFillBar
              classId={classId}
              pointsPossible={Number(assignment.points_possible)}
              marks={marks}
              pending={bulkFill.isPending}
              onFill={(value, onlyBlank) => bulkFill.mutate({ value, onlyBlank })}
            />
          </div>

          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {roster.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students enrolled yet.</p>
            ) : (
              roster.map((s) => {
                const sub = submissions.find((x) => x.student_id === s.id);
                const g = grades.find((x) => x.student_id === s.id);
                return (
                  <div key={s.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm font-medium">
                        {s.last_name}, {s.first_name}
                      </span>
                      <div className="flex items-center gap-3">
                        {assignment.submission_mode === "collected" ? (
                          <label className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={
                                g?.points_earned != null ||
                                sub?.status === "collected" ||
                                sub?.status === "returned"
                              }
                              disabled={g?.points_earned != null}
                              onCheckedChange={(v) =>
                                check.mutate({ studentId: s.id, collected: !!v })
                              }
                            />
                            {g?.points_earned != null ? "Collected (scored)" : "Collected"}
                          </label>
                        ) : sub && sub.status !== "draft" ? (
                          <Badge variant="secondary">Turned in</Badge>
                        ) : sub ? (
                          <Badge variant="outline">In progress</Badge>
                        ) : assignment.due_date &&
                          assignment.due_date < new Date().toISOString().slice(0, 10) ? (
                          <Badge variant="outline">Missing</Badge>
                        ) : (
                          <Badge variant="outline">Not due yet</Badge>
                        )}
                        <Input
                          key={cellText(g)}
                          className="h-8 w-24"
                          placeholder={`/${assignment.points_possible}`}
                          defaultValue={cellText(g)}
                          title={
                            marks.length
                              ? `Enter points or a mark: ${marks
                                  .map((m) => `${m.code} = ${m.label}`)
                                  .join(", ")}`
                              : undefined
                          }
                          onBlur={(e) => {
                            if (e.target.value === cellText(g)) return;
                            score.mutate({ studentId: s.id, value: e.target.value });
                          }}
                        />
                      </div>
                    </div>
                    <div className="mt-2">
                      <QuickScoreBar
                        classId={classId}
                        pointsPossible={Number(assignment.points_possible)}
                        editable={false}
                        onPick={(value) => score.mutate({ studentId: s.id, value })}
                      />
                    </div>

                    {proofreading[s.id] && sub ? (
                      <>
                        <ProofreadEditor
                          submissionId={sub.id}
                          body={sub.body ?? ""}
                          teacherNote={sub.teacher_note}
                          onNoteSaved={() =>
                            queryClient.invalidateQueries({
                              queryKey: ["assignment-submissions", assignment.id],
                            })
                          }
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 h-7"
                          onClick={() =>
                            setProofreading((p) => ({ ...p, [s.id]: false }))
                          }
                        >
                          Hide proofreading
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2 h-7"
                        onClick={() => {
                          setProofreading((p) => ({ ...p, [s.id]: true }));
                          if (!sub) startFeedback.mutate(s.id);
                        }}
                        disabled={startFeedback.isPending}
                      >
                        Proofread & comment
                      </Button>
                    )}
                    {sub?.file_uploads ? (
                      <button
                        type="button"
                        onClick={() => openFile(sub.file_uploads!.storage_path)}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        <Download className="h-3 w-3" /> {sub.file_uploads.file_name}
                      </button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
