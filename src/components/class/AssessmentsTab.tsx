import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { applyMissedAssessmentZeros } from "@/lib/assessments.functions";

import { toast } from "sonner";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ASSESSMENT_KINDS,
  ASSESSMENT_KIND_LABELS,
  QUESTION_KINDS,
  QUESTION_KIND_LABELS,
  type AnswerKey,
  type AssessmentKind,
  type QuestionKind,
} from "@/lib/assessments";
import { formatDate } from "@/lib/school";
import { AssessmentGrading } from "@/components/class/AssessmentGrading";
import { TakeAssessment } from "@/components/class/TakeAssessment";
import { ShareResourceButton } from "@/components/class/ShareResourceButton";
import { CopyToClassesButton } from "@/components/class/CopyToClassesButton";

import { DraftStatus, readDraft, useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import {
  CourseworkWindowFields,
  WindowBadge,
} from "@/components/class/CourseworkWindowFields";
import { isoToZonedInput, zonedInputToIso } from "@/lib/coursework-window";
import {
  REOPEN_DEFAULTS,
  ReopenOptions,
  type ReopenSettings,
} from "@/components/class/ReopenOptions";
import { reopenCoursework } from "@/lib/coursework-reopen.functions";



type AssessmentRow = {
  id: string;
  title: string;
  kind: string;
  instructions: string | null;
  due_at: string | null;
  available_from: string | null;
  closes_at: string | null;
  time_limit_minutes: number | null;
  published: boolean;
  grammar_check_enabled: boolean;
  assignment_id: string | null;
};

export function AssessmentsTab({
  classId,
  isStaff,
  assignments,
  categories,
  gradeLevel,
  timeZone,
}: {
  classId: string;
  isStaff: boolean;
  assignments: { id: string; title: string; points_possible: number; category?: string | null }[];
  categories: string[];
  gradeLevel?: number | null;
  timeZone: string;
}) {

  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  // Closed assessments nobody handed in are scored 0 automatically; teachers can
  // still type any score over the top of it.
  const autoZero = useServerFn(applyMissedAssessmentZeros);
  const zeroedOnce = useRef(false);
  useEffect(() => {
    if (!isStaff || zeroedOnce.current) return;
    zeroedOnce.current = true;
    autoZero({ data: { classId } })
      .then((result) => {
        if (result.zeroed > 0 || result.synced > 0) {
          queryClient.invalidateQueries({ queryKey: ["grades"] });
          queryClient.invalidateQueries({ queryKey: ["assignment-grades"] });
        }

      })
      .catch(() => {
        /* scoring can be retried on the next visit */
      });
  }, [isStaff, classId, autoZero, queryClient]);



  const { data: assessments = [] } = useQuery({
    queryKey: ["assessments", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessments")
        .select(
          "id, title, kind, instructions, due_at, available_from, closes_at, time_limit_minutes, published, grammar_check_enabled, assignment_id",
        )
        .eq("class_id", classId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AssessmentRow[];
    },
  });

  const update = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<AssessmentRow> }) => {
      const { error } = await supabase
        .from("assessments")
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assessments", classId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assessments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assessment deleted");
      queryClient.invalidateQueries({ queryKey: ["assessments", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visible = isStaff ? assessments : assessments.filter((a) => a.published);

  return (
    <div className="mt-6 space-y-4 border-t border-border pt-6">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Online quizzes, tests &amp; essays
      </h3>
      {isStaff && (
        <NewAssessment
          classId={classId}
          assignments={assignments}
          categories={categories}
          timeZone={timeZone}
        />
      )}



      {visible.length === 0 ? (
        <p className="panel p-6 text-sm text-muted-foreground">
          {isStaff
            ? "No assessments yet. Build a quiz, test, exit ticket or essay — objective questions grade themselves the moment a student submits."
            : "No assessments have been posted for this class yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((a) => (
            <li key={a.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{a.title}</h3>
                    <Badge variant="secondary">
                      {ASSESSMENT_KIND_LABELS[a.kind as AssessmentKind] ?? a.kind}
                    </Badge>
                    {a.published ? (
                      <Badge>Open</Badge>
                    ) : (
                      <Badge variant="outline">Draft</Badge>
                    )}
                    {a.grammar_check_enabled && (
                      <Badge variant="outline">Grammar proof on</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{a.due_at ? `Due ${formatDate(a.due_at.slice(0, 10))}` : "No due date"}</span>
                    <WindowBadge
                      availableFrom={a.available_from}
                      closesAt={a.closes_at}
                      timeZone={timeZone}
                    />
                    {a.time_limit_minutes ? (
                      <Badge variant="outline" className="gap-1">
                        <Clock className="size-3" />
                        {a.time_limit_minutes} min limit
                      </Badge>
                    ) : null}
                    {(() => {
                      const column = assignments.find((x) => x.id === a.assignment_id);
                      if (!column) return <span>not linked to gradebook</span>;
                      return (
                        <Badge variant="secondary">
                          {column.category?.trim() || "Uncategorized"}
                        </Badge>
                      );
                    })()}
                  </div>

                </div>
                <div className="flex items-center gap-2">
                  {isStaff && (
                    <>
                      <div className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={a.published}
                          onCheckedChange={(v) =>
                            update.mutate({ id: a.id, patch: { published: v } })
                          }
                          aria-label="Published"
                        />
                        <span className="text-muted-foreground">Open to students</span>
                      </div>
                      <EditAssessment
                        classId={classId}
                        assessment={a}
                        assignments={assignments}
                        categories={categories}
                        timeZone={timeZone}
                      />

                      <ShareResourceButton
                        kind="assessment"
                        id={a.id}
                        title={a.title}
                        defaultGrade={gradeLevel ?? null}
                      />
                      <CopyToClassesButton
                        kind="assessment"
                        id={a.id}
                        title={a.title}
                        classId={classId}
                      />

                      <ConfirmDeleteButton
                        title={`Delete "${a.title}"?`}
                        description="This removes the assessment along with its questions, student submissions and grades."
                        onConfirm={() => remove.mutate(a.id)}
                        disabled={remove.isPending}
                      />


                    </>
                  )}
                  {isStaff ? (
                    <>
                      <Button
                        size="sm"
                        variant={openId === `build:${a.id}` ? "default" : "outline"}
                        onClick={() =>
                          setOpenId(openId === `build:${a.id}` ? null : `build:${a.id}`)
                        }
                      >
                        {openId === `build:${a.id}` ? "Close build" : "Build questions"}
                      </Button>
                      <Button
                        size="sm"
                        variant={openId === `grade:${a.id}` ? "default" : "outline"}
                        className={
                          openId === `grade:${a.id}`
                            ? "bg-amber-500 text-white hover:bg-amber-500/90"
                            : "border-amber-500/40 text-amber-600"
                        }
                        onClick={() =>
                          setOpenId(openId === `grade:${a.id}` ? null : `grade:${a.id}`)
                        }
                      >
                        {openId === `grade:${a.id}` ? "Close grading" : "Grade submissions"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpenId(openId === a.id ? null : a.id)}
                    >
                      {openId === a.id ? "Close" : "Open"}
                    </Button>
                  )}
                </div>
              </div>

              {isStaff && openId === `build:${a.id}` && (
                <div className="mt-4 border-t border-border pt-4">
                  <QuestionBuilder assessmentId={a.id} />
                </div>
              )}
              {isStaff && openId === `grade:${a.id}` && (
                <div className="mt-4 border-t-2 border-amber-500/40 pt-4">
                  <AssessmentGrading
                    assessmentId={a.id}
                    classId={classId}
                    grammarEnabled={a.grammar_check_enabled}
                  />
                </div>
              )}
              {!isStaff && openId === a.id && (
                <div className="mt-4 border-t border-border pt-4">
                  <TakeAssessment assessmentId={a.id} />
                </div>
              )}

            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Assessments score into the gradebook through an assignment column, so the column
 * carries the grading-setup category the teacher picks here.
 */
async function resolveGradebookColumn(opts: {
  classId: string;
  assignmentId: string;
  category: string;
  title: string;
  due: string;
}): Promise<string | null> {
  if (opts.category === "none") return null;
  if (opts.assignmentId !== "none") {
    const { error } = await supabase
      .from("assignments")
      // Assessments are always completed online, so the column never offers "Collect all".
      .update({ category: opts.category, submission_mode: "online" })

      .eq("id", opts.assignmentId);
    if (error) throw error;
    return opts.assignmentId;
  }
  const { data, error } = await supabase
    .from("assignments")
    .insert({
      class_id: opts.classId,
      title: opts.title,
      category: opts.category,
      points_possible: 100,
      due_date: opts.due || null,
      submission_mode: "online",
      description: "Online assessment",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Keeps the linked gradebook column's points in step with the question total. */
async function syncColumnPoints(assessmentId: string) {
  const { data: assessment } = await supabase
    .from("assessments")
    .select("assignment_id")
    .eq("id", assessmentId)
    .maybeSingle();
  if (!assessment?.assignment_id) return;
  const { data: qs } = await supabase
    .from("assessment_questions")
    .select("points")
    .eq("assessment_id", assessmentId);
  const total = (qs ?? []).reduce((s, q) => s + Number(q.points || 0), 0);
  if (total <= 0) return;
  await supabase
    .from("assignments")
    .update({ points_possible: total })
    .eq("id", assessment.assignment_id);
}

function NewAssessment({
  classId,
  assignments,
  categories,
  timeZone,
}: {
  classId: string;
  assignments: { id: string; title: string; points_possible: number; category?: string | null }[];
  categories: string[];
  timeZone: string;
}) {

  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const draftKey = `new-assessment:${classId}`;
  const blank = {
    title: "",
    kind: "quiz" as AssessmentKind,
    instructions: "",
    due: "",
    limit: "",
    assignmentId: "none",
    category: categories[0] ?? "none",
    grammar: true,
    availableFrom: "",
    closesAt: "",
  };
  const [form, setForm] = useState(() => readDraft<typeof blank>(draftKey) ?? blank);
  const formDirty = form.title.trim().length > 0 || form.instructions.trim().length > 0;
  const draft = useAutosaveDraft(draftKey, form, { dirty: formDirty });


  const create = useMutation({
    mutationFn: async () => {
      if (form.title.trim().length < 2) throw new Error("Give the assessment a title");
      const title = form.title.trim().slice(0, 160);
      const assignmentId = await resolveGradebookColumn({
        classId,
        assignmentId: form.assignmentId,
        category: form.category,
        title,
        due: form.due,
      });
      const { error } = await supabase.from("assessments").insert({
        class_id: classId,
        title,
        kind: form.kind,
        instructions: form.instructions.trim().slice(0, 2000) || null,
        due_at: form.due ? new Date(`${form.due}T23:59:00`).toISOString() : null,
        available_from: zonedInputToIso(form.availableFrom, timeZone),
        closes_at: zonedInputToIso(form.closesAt, timeZone),
        time_limit_minutes: form.limit ? Number(form.limit) : null,
        assignment_id: assignmentId,
        grammar_check_enabled: form.grammar,
      });
      if (error) throw error;

    },
    onSuccess: () => {
      toast.success("Assessment created — add questions next");
      setOpen(false);
      setForm(blank);
      draft.clear();
      queryClient.invalidateQueries({ queryKey: ["assessments", classId] });
      queryClient.invalidateQueries({ queryKey: ["assignments", classId] });
    },


    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">New assessment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New assessment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="a-title">Title</Label>
            <Input
              id="a-title"
              value={form.title}
              maxLength={160}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="a-kind">Type</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => setForm({ ...form, kind: v as AssessmentKind })}
              >
                <SelectTrigger id="a-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSESSMENT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {ASSESSMENT_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-limit">Time limit (min)</Label>
              <Input
                id="a-limit"
                inputMode="numeric"
                value={form.limit}
                onChange={(e) => setForm({ ...form, limit: e.target.value })}
              />
            </div>
          </div>
          <CourseworkWindowFields
            idPrefix="new-assessment"
            timeZone={timeZone}
            availableFrom={form.availableFrom}
            closesAt={form.closesAt}
            onChange={(next) => setForm({ ...form, ...next })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="a-due">Due date</Label>
              <Input
                id="a-due"
                type="date"
                value={form.due}
                onChange={(e) => setForm({ ...form, due: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-category">Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger id="a-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">Not graded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-assignment">Gradebook column</Label>
            <Select
              value={form.assignmentId}
              onValueChange={(v) => setForm({ ...form, assignmentId: v })}
              disabled={form.category === "none"}
            >
              <SelectTrigger id="a-assignment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Create a new column for this assessment</SelectItem>
                {assignments.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title}
                    {a.category ? ` · ${a.category}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The category above comes from this class's grading setup and is what the
              gradebook weights this assessment under.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="a-instructions">Instructions</Label>
            <Textarea
              id="a-instructions"
              rows={3}
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.grammar}
              onCheckedChange={(v) => setForm({ ...form, grammar: v === true })}
            />
            Enable AI grammar proofing for written responses
          </label>
        </div>
        <DialogFooter className="sm:justify-between">
          <DraftStatus state={draft.state} savedAt={draft.savedAt} dirty={formDirty} />
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            Create
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}

function EditAssessment({
  classId,
  assessment,
  assignments,
  categories,
  timeZone,
}: {
  classId: string;
  assessment: AssessmentRow;
  assignments: { id: string; title: string; points_possible: number; category?: string | null }[];
  categories: string[];
  timeZone: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const currentCategory = () => {
    const column = assignments.find((a) => a.id === assessment.assignment_id);
    if (!column) return "none";
    return column.category?.trim() || categories[0] || "none";
  };
  const initial = () => ({
    title: assessment.title,
    kind: assessment.kind as AssessmentKind,
    instructions: assessment.instructions ?? "",
    due: assessment.due_at ? assessment.due_at.slice(0, 10) : "",
    limit: assessment.time_limit_minutes ? String(assessment.time_limit_minutes) : "",
    assignmentId: assessment.assignment_id ?? "none",
    category: currentCategory(),
    grammar: assessment.grammar_check_enabled,
    availableFrom: isoToZonedInput(assessment.available_from, timeZone),
    closesAt: isoToZonedInput(assessment.closes_at, timeZone),
  });
  const [form, setForm] = useState(initial);
  const [reopen, setReopen] = useState<ReopenSettings>(REOPEN_DEFAULTS);
  const reopenWork = useServerFn(reopenCoursework);

  function openChange(next: boolean) {
    if (next) {
      setForm(initial());
      setReopen(REOPEN_DEFAULTS);
    }
    setOpen(next);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (form.title.trim().length < 2) throw new Error("Give the assessment a title");
      const title = form.title.trim().slice(0, 160);
      const assignmentId = await resolveGradebookColumn({
        classId,
        assignmentId: form.assignmentId,
        category: form.category,
        title,
        due: form.due,
      });
      const { error } = await supabase
        .from("assessments")
        .update({
          title,
          kind: form.kind,
          instructions: form.instructions.trim().slice(0, 2000) || null,
          due_at: form.due ? new Date(`${form.due}T23:59:00`).toISOString() : null,
          available_from: zonedInputToIso(form.availableFrom, timeZone),
          closes_at: zonedInputToIso(form.closesAt, timeZone),
          time_limit_minutes: form.limit ? Number(form.limit) : null,
          assignment_id: assignmentId,
          grammar_check_enabled: form.grammar,
        })
        .eq("id", assessment.id);
      if (error) throw error;
      await syncColumnPoints(assessment.id);

      if (reopen.reopen && assignmentId) {
        return reopenWork({
          data: { assignmentId, scope: reopen.scope, notify: reopen.notify },
        });
      }
      return null;
    },
    onSuccess: (result) => {
      toast.success(
        result && result.reopened > 0
          ? `Assessment updated — reopened for ${result.reopened} student${result.reopened === 1 ? "" : "s"}`
          : "Assessment updated",
      );
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["assessments", classId] });
      queryClient.invalidateQueries({ queryKey: ["assignments", classId] });
      queryClient.invalidateQueries({ queryKey: ["grades"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-grades"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit assessment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`e-title-${assessment.id}`}>Title</Label>
            <Input
              id={`e-title-${assessment.id}`}
              value={form.title}
              maxLength={160}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`e-kind-${assessment.id}`}>Type</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => setForm({ ...form, kind: v as AssessmentKind })}
              >
                <SelectTrigger id={`e-kind-${assessment.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSESSMENT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {ASSESSMENT_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`e-limit-${assessment.id}`}>Time limit (min)</Label>
              <Input
                id={`e-limit-${assessment.id}`}
                inputMode="numeric"
                value={form.limit}
                onChange={(e) => setForm({ ...form, limit: e.target.value })}
              />
            </div>
          </div>
          <CourseworkWindowFields
            idPrefix={`e-window-${assessment.id}`}
            timeZone={timeZone}
            availableFrom={form.availableFrom}
            closesAt={form.closesAt}
            onChange={(next) => setForm({ ...form, ...next })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`e-due-${assessment.id}`}>Due date</Label>
              <Input
                id={`e-due-${assessment.id}`}
                type="date"
                value={form.due}
                onChange={(e) => setForm({ ...form, due: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`e-cat-${assessment.id}`}>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger id={`e-cat-${assessment.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">Not graded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`e-assign-${assessment.id}`}>Gradebook column</Label>
            <Select
              value={form.assignmentId}
              onValueChange={(v) => setForm({ ...form, assignmentId: v })}
              disabled={form.category === "none"}
            >
              <SelectTrigger id={`e-assign-${assessment.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Create a new column for this assessment</SelectItem>
                {assignments.map((as) => (
                  <SelectItem key={as.id} value={as.id}>
                    {as.title}
                    {as.category ? ` · ${as.category}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`e-instr-${assessment.id}`}>Instructions</Label>
            <Textarea
              id={`e-instr-${assessment.id}`}
              rows={3}
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.grammar}
              onCheckedChange={(v) => setForm({ ...form, grammar: v === true })}
            />
            Enable AI grammar proofing for written responses
          </label>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



type QuestionRow = {
  id: string;
  position: number;
  kind: string;
  prompt: string;
  options: unknown;
  answer_key: unknown;
  points: number;
  rubric: string | null;
};

type QuestionDraft = {
  kind: QuestionKind;
  prompt: string;
  points: string;
  rubric: string;
  options: string[];
  correct: number[];
  accepted: string;
  manualKey?: boolean;
  numeric: { value: string; tolerance: string };
};

function QuestionBuilder({ assessmentId }: { assessmentId: string }) {
  const queryClient = useQueryClient();
  const draftKey = `assessment-question:${assessmentId}`;
  const saved = readDraft<QuestionDraft>(draftKey);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<QuestionKind>(saved?.kind ?? "multiple_choice");
  const [prompt, setPrompt] = useState(saved?.prompt ?? "");
  const [points, setPoints] = useState(saved?.points ?? "1");
  const [rubric, setRubric] = useState(saved?.rubric ?? "");
  const [options, setOptions] = useState<string[]>(saved?.options ?? ["", "", "", ""]);
  const [correct, setCorrect] = useState<number[]>(saved?.correct ?? []);
  const [accepted, setAccepted] = useState(saved?.accepted ?? "");
  const [manualKey, setManualKey] = useState(saved?.manualKey ?? false);
  const [numeric, setNumeric] = useState(saved?.numeric ?? { value: "", tolerance: "0" });
  const questionDirty = prompt.trim().length > 0;
  const draft = useAutosaveDraft<QuestionDraft>(
    draftKey,
    { kind, prompt, points, rubric, options, correct, accepted, manualKey, numeric },
    { dirty: questionDirty },
  );


  const { data: questions = [] } = useQuery({
    queryKey: ["assessment-questions", assessmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_questions")
        .select("id, position, kind, prompt, options, answer_key, points, rubric")
        .eq("assessment_id", assessmentId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as QuestionRow[];
    },
  });

  function reset() {
    setEditingId(null);
    setKind("multiple_choice");
    setPrompt("");
    setPoints("1");
    setRubric("");
    setOptions(["", "", "", ""]);
    setCorrect([]);
    setAccepted("");
    setManualKey(false);
    setNumeric({ value: "", tolerance: "0" });
    draft.clear();
  }


  function startEdit(q: QuestionRow) {
    const key = (q.answer_key ?? {}) as AnswerKey;
    const opts = Array.isArray(q.options) ? (q.options as string[]) : [];
    setEditingId(q.id);
    setKind(q.kind as QuestionKind);
    setPrompt(q.prompt);
    setPoints(String(q.points));
    setRubric(q.rubric ?? "");
    setOptions(opts.length > 0 ? opts : ["", "", "", ""]);
    setCorrect(key.choices ?? (key.choice != null ? [key.choice] : []));
    setAccepted((key.accepted ?? []).join("\n"));
    setManualKey(
      Boolean(key.manual) ||
        (q.kind === "short_answer" && (key.accepted ?? []).length === 0) ||
        q.kind === "essay",
    );
    setNumeric({
      value: key.value != null ? String(key.value) : "",
      tolerance: String(key.tolerance ?? 0),
    });
  }

  function buildPayload() {
    if (prompt.trim().length < 3) throw new Error("Write the question prompt");
    const pts = Number(points);
    if (Number.isNaN(pts) || pts <= 0) throw new Error("Points must be greater than zero");

    let opts: string[] = [];
    let key: AnswerKey = {};

    if (kind === "multiple_choice" || kind === "multi_select") {
      opts = options.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) throw new Error("Add at least two answer choices");
      const valid = correct.filter((i) => i < opts.length);
      if (valid.length === 0) throw new Error("Mark the correct answer(s)");
      key = kind === "multiple_choice" ? { choice: valid[0] } : { choices: [...valid].sort() };
    } else if (kind === "true_false") {
      opts = ["True", "False"];
      if (correct.length === 0) throw new Error("Choose True or False as the answer");
      key = { choice: correct[0] };
    } else if (kind === "short_answer") {
      if (manualKey) {
        key = { manual: true };
      } else {
        const list = accepted
          .split(/\n|,/)
          .map((a) => a.trim())
          .filter(Boolean);
        if (list.length === 0)
          throw new Error("Add at least one accepted answer, or tick “Answers will vary”");
        key = { accepted: list };
      }
    } else if (kind === "numeric") {
      const value = Number(numeric.value);
      if (Number.isNaN(value)) throw new Error("Enter the correct numeric answer");
      key = { value, tolerance: Number(numeric.tolerance) || 0 };
    } else if (kind === "essay" && manualKey) {
      key = { manual: true };
    }

    return {
      kind,
      prompt: prompt.trim().slice(0, 2000),
      options: opts,
      answer_key: key,
      points: pts,
      rubric: rubric.trim().slice(0, 2000) || null,
    };
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (editingId) {
        const { error } = await supabase
          .from("assessment_questions")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        return "updated" as const;
      }
      const { error } = await supabase
        .from("assessment_questions")
        .insert({ assessment_id: assessmentId, position: questions.length, ...payload });
      if (error) throw error;
      return "added" as const;
    },
    onSuccess: async (result) => {
      toast.success(result === "updated" ? "Question updated" : "Question added");
      reset();
      await syncColumnPoints(assessmentId);
      queryClient.invalidateQueries({ queryKey: ["assessment-questions", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assessment_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_d, id) => {
      if (editingId === id) reset();
      await syncColumnPoints(assessmentId);
      queryClient.invalidateQueries({ queryKey: ["assessment-questions", assessmentId] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const total = questions.reduce((s, q) => s + Number(q.points), 0);


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Questions
        </h4>
        <span className="text-xs text-muted-foreground">
          {questions.length} questions · {total} points
        </span>
      </div>

      {questions.length > 0 && (
        <ol className="space-y-2">
          {questions.map((q, i) => (
            <li
              key={q.id}
              className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${
                editingId === q.id
                  ? "border-primary bg-primary/5"
                  : "border-border bg-secondary/30"
              }`}
            >
              <div>
                <p className="font-medium">
                  {i + 1}. {q.prompt}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {QUESTION_KIND_LABELS[q.kind as QuestionKind] ?? q.kind} · {q.points} pts ·{" "}
                  {q.kind === "essay" || (q.answer_key as AnswerKey | null)?.manual
                    ? "answers will vary · teacher scored"
                    : "auto-graded"}
                  {editingId === q.id ? " · editing" : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => startEdit(q)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove.mutate(q.id)}>
                  Remove
                </Button>
              </div>
            </li>

          ))}
        </ol>
      )}

      <div className="rounded-lg border border-dashed border-border p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="q-kind">Question type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as QuestionKind)}>
              <SelectTrigger id="q-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {QUESTION_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-points">Points</Label>
            <Input
              id="q-points"
              inputMode="decimal"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <Label htmlFor="q-prompt">Prompt</Label>
          <Textarea
            id="q-prompt"
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        {(kind === "multiple_choice" || kind === "multi_select") && (
          <div className="mt-3 space-y-2">
            <Label>Answer choices (tick the correct one{kind === "multi_select" && "s"})</Label>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Checkbox
                  checked={correct.includes(i)}
                  onCheckedChange={(v) => {
                    if (v === true) {
                      setCorrect(kind === "multiple_choice" ? [i] : [...correct, i]);
                    } else {
                      setCorrect(correct.filter((c) => c !== i));
                    }
                  }}
                  aria-label={`Choice ${i + 1} correct`}
                />
                <Input
                  value={opt}
                  placeholder={`Choice ${i + 1}`}
                  onChange={(e) => {
                    const next = [...options];
                    next[i] = e.target.value;
                    setOptions(next);
                  }}
                />
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setOptions([...options, ""])}>
              Add choice
            </Button>
          </div>
        )}

        {kind === "true_false" && (
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="q-tf">Correct answer</Label>
            <Select
              value={correct[0] === 0 ? "true" : correct[0] === 1 ? "false" : ""}
              onValueChange={(v) => setCorrect([v === "true" ? 0 : 1])}
            >
              <SelectTrigger id="q-tf">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">True</SelectItem>
                <SelectItem value="false">False</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {kind === "short_answer" && (
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={manualKey}
                onChange={(e) => setManualKey(e.target.checked)}
              />
              Answers will vary — leave ungraded for me to score
            </label>
            {manualKey ? (
              <p className="text-xs text-muted-foreground">
                Students' responses arrive in the grading panel marked “Needs review” so you can
                award points and add feedback yourself.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="q-accepted">Accepted answers (one per line)</Label>
                <Textarea
                  id="q-accepted"
                  rows={3}
                  value={accepted}
                  placeholder={"photosynthesis\nphoto synthesis"}
                  onChange={(e) => setAccepted(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Matching ignores case, spacing and punctuation.
                </p>
              </div>
            )}
          </div>
        )}

        {kind === "numeric" && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="q-value">Correct value</Label>
              <Input
                id="q-value"
                inputMode="decimal"
                value={numeric.value}
                onChange={(e) => setNumeric({ ...numeric, value: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-tol">± tolerance</Label>
              <Input
                id="q-tol"
                inputMode="decimal"
                value={numeric.tolerance}
                onChange={(e) => setNumeric({ ...numeric, tolerance: e.target.value })}
              />
            </div>
          </div>
        )}

        {kind === "essay" && (
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={manualKey}
                onChange={(e) => setManualKey(e.target.checked)}
              />
              Answers will vary — leave ungraded for me to score
            </label>
            <p className="text-xs text-muted-foreground">
              {manualKey
                ? "Responses arrive in the grading panel marked “Needs review”. Nothing is scored until you award points — the AI proof stays a suggestion."
                : "Responses still wait for your review; the rubric guides the AI proofreading and suggested score."}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="q-rubric">Rubric (guides AI grammar proof and scoring)</Label>
              <Textarea
                id="q-rubric"
                rows={3}
                value={rubric}
                onChange={(e) => setRubric(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {editingId ? "Save changes" : "Add question"}
          </Button>
          {editingId && (
            <Button size="sm" variant="ghost" onClick={reset}>
              Cancel edit
            </Button>
          )}
          <DraftStatus state={draft.state} savedAt={draft.savedAt} dirty={questionDirty} />
        </div>


      </div>
    </div>
  );
}
