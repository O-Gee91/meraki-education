import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Paperclip } from "lucide-react";
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
    return <StaffCollectPanel assignment={assignment} roster={roster} />;
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
    mutationFn: async () => {
      if (!me) throw new Error("Your account is not linked to a student record yet");
      const file = inputRef.current?.files?.[0];
      if (!body.trim() && !file) throw new Error("Write a response or attach a file");
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

      if (mine) {
        const { error } = await supabase
          .from("assignment_submissions")
          .update({
            body: body.trim() || null,
            file_upload_id: fileUploadId,
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
          status: "submitted",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Work turned in");
      setOpen(false);
      if (inputRef.current) inputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["assignment-submissions", assignment.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scored = grade?.points_earned != null;

  if (assignment.submission_mode !== "online") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">Collected in class</Badge>
        {mine?.status === "collected" || mine?.status === "returned" ? (
          <Badge variant="secondary">Checked in by teacher</Badge>
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
      {mine ? (
        <Badge variant="secondary">
          Turned in {formatDate(mine.submitted_at.slice(0, 10))}
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
          if (v) setBody(mine?.body ?? "");
        }}
      >
        <DialogTrigger asChild>
          <Button size="sm" variant={mine ? "outline" : "default"} className="h-7">
            {mine ? "View / edit work" : "Start assignment"}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{assignment.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
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
          <DialogFooter>
            <Button
              onClick={() => submit.mutate()}
              disabled={submit.isPending || mine?.status === "returned"}
            >
              {submit.isPending ? "Turning in…" : mine ? "Update submission" : "Turn in"}
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
}: {
  assignment: {
    id: string;
    title: string;
    points_possible: number;
    submission_mode: string;
  };
  roster: Student[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: submissions = [] } = useSubmissions(assignment.id);

  const { data: grades = [] } = useQuery({
    queryKey: ["assignment-grades", assignment.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("id, student_id, points_earned")
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

  const score = useMutation({
    mutationFn: async (input: { studentId: string; value: string; note?: string }) => {
      const raw = input.value.trim();
      const points = raw === "" ? null : Number(raw);
      if (points != null && (Number.isNaN(points) || points < 0 || points > 10000))
        throw new Error("Enter a valid score");
      const { error } = await supabase.from("grades").upsert(
        {
          assignment_id: assignment.id,
          student_id: input.studentId,
          points_earned: points,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "assignment_id,student_id" },
      );
      if (error) throw error;

      const existing = submissions.find((s) => s.student_id === input.studentId);
      if (existing && points != null) {
        await supabase
          .from("assignment_submissions")
          .update({ status: "returned" })
          .eq("id", existing.id);
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

  const turnedIn = submissions.filter((s) => s.status !== "submitted" || s.body || s.file_upload_id)
    .length;

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
                              checked={sub?.status === "collected" || sub?.status === "returned"}
                              onCheckedChange={(v) =>
                                check.mutate({ studentId: s.id, collected: !!v })
                              }
                            />
                            Collected
                          </label>
                        ) : sub ? (
                          <Badge variant="secondary">Turned in</Badge>
                        ) : (
                          <Badge variant="outline">Missing</Badge>
                        )}
                        <Input
                          className="h-8 w-24"
                          inputMode="decimal"
                          placeholder={`/${assignment.points_possible}`}
                          defaultValue={g?.points_earned ?? ""}
                          onBlur={(e) => {
                            if (e.target.value === String(g?.points_earned ?? "")) return;
                            score.mutate({ studentId: s.id, value: e.target.value });
                          }}
                        />
                      </div>
                    </div>
                    {sub ? (
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
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2 h-7"
                        onClick={() => startFeedback.mutate(s.id)}
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
