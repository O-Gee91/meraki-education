import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ManageMarksDialog, useProofreadMarks } from "@/components/class/ProofreadMarks";
import { DraftStatus, readDraft, useAutosaveDraft } from "@/hooks/useAutosaveDraft";

export type Annotation = {
  id: string;
  mark_code: string | null;
  mark_symbol: string | null;
  mark_label: string | null;
  excerpt: string;
  start_offset: number | null;
  end_offset: number | null;
  comment: string | null;
  created_at: string;
};

function useAnnotations(submissionId: string | undefined) {
  return useQuery({
    queryKey: ["submission-annotations", submissionId],
    enabled: !!submissionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submission_annotations")
        .select(
          "id, mark_code, mark_symbol, mark_label, excerpt, start_offset, end_offset, comment, created_at",
        )
        .eq("submission_id", submissionId!)
        .order("start_offset", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Annotation[];
    },
  });
}

function MarkChip({ a }: { a: Annotation }) {
  return (
    <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
      {a.mark_symbol || a.mark_code || "note"}
    </span>
  );
}

/* -------------------- teacher proofreading -------------------- */

export function ProofreadEditor({
  submissionId,
  body,
  teacherNote,
  onNoteSaved,
}: {
  submissionId: string;
  body: string;
  teacherNote: string | null;
  onNoteSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLDivElement>(null);
  const { data: marks = [] } = useProofreadMarks();
  const { data: annotations = [] } = useAnnotations(submissionId);
  const [selection, setSelection] = useState<{ text: string; start: number; end: number } | null>(
    null,
  );
  const [markId, setMarkId] = useState<string>("");
  const annotationKey = `annotation-comment:${submissionId}`;
  const [comment, setComment] = useState(() => readDraft<string>(annotationKey) ?? "");
  const annotationDraft = useAutosaveDraft(annotationKey, comment, {
    dirty: comment.trim().length > 0,
  });
  const noteKey = `teacher-note:${submissionId}`;
  const [note, setNote] = useState(
    () => readDraft<string>(`teacher-note:${submissionId}`) ?? teacherNote ?? "",
  );
  const noteDraft = useAutosaveDraft(noteKey, note, {
    dirty: note.trim() !== (teacherNote ?? "").trim(),
  });

  const captureSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !bodyRef.current) return;
    const range = sel.getRangeAt(0);
    if (!bodyRef.current.contains(range.commonAncestorContainer)) return;
    const pre = range.cloneRange();
    pre.selectNodeContents(bodyRef.current);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const text = sel.toString();
    if (!text.trim()) return;
    setSelection({ text: text.slice(0, 500), start, end: start + text.length });
  };

  const addAnnotation = useMutation({
    mutationFn: async () => {
      if (!selection && !comment.trim())
        throw new Error("Highlight some text or write a comment first");
      const mark = marks.find((m) => m.id === markId);
      const { error } = await supabase.from("submission_annotations").insert({
        submission_id: submissionId,
        mark_code: mark?.code ?? null,
        mark_symbol: mark?.symbol ?? null,
        mark_label: mark?.label ?? null,
        excerpt: selection?.text ?? "",
        start_offset: selection?.start ?? null,
        end_offset: selection?.end ?? null,
        comment: comment.trim().slice(0, 1000) || mark?.meaning || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mark added");
      setSelection(null);
      setComment("");
      annotationDraft.clear();
      setMarkId("");
      window.getSelection()?.removeAllRanges();
      queryClient.invalidateQueries({ queryKey: ["submission-annotations", submissionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAnnotation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("submission_annotations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["submission-annotations", submissionId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("assignment_submissions")
        .update({ teacher_note: note.trim().slice(0, 5000) || null })
        .eq("id", submissionId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comment saved for the student");
      noteDraft.clear();
      onNoteSaved?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Proofread & comment
        </p>
        <ManageMarksDialog />
      </div>

      {body ? (
        <div
          ref={bodyRef}
          onMouseUp={captureSelection}
          onKeyUp={captureSelection}
          className="max-h-64 select-text overflow-y-auto whitespace-pre-wrap rounded-md bg-secondary/40 p-3 text-sm leading-relaxed"
        >
          {body}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No typed response — use the comment box below for feedback on collected or attached work.
        </p>
      )}

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {selection
            ? `Marking: “${selection.text.slice(0, 80)}${selection.text.length > 80 ? "…" : ""}”`
            : "Highlight text above, then pick a mark."}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {marks.map((m) => (
            <Button
              key={m.id}
              type="button"
              size="sm"
              variant={markId === m.id ? "default" : "outline"}
              className="h-7"
              title={m.meaning ?? m.label}
              onClick={() => setMarkId(markId === m.id ? "" : m.id)}
            >
              <span className="font-mono">{m.symbol || m.code}</span>
              <span className="ml-1.5 text-xs">{m.label}</span>
            </Button>
          ))}
        </div>
        <Textarea
          rows={2}
          placeholder="Comment for this mark (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => addAnnotation.mutate()} disabled={addAnnotation.isPending}>
            Add mark
          </Button>
          {selection ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelection(null);
                window.getSelection()?.removeAllRanges();
              }}
            >
              Clear selection
            </Button>
          ) : null}
        </div>
        <DraftStatus
          state={annotationDraft.state}
          savedAt={annotationDraft.savedAt}
          dirty={comment.trim().length > 0}
        />
      </div>

      {annotations.length > 0 ? (
        <ul className="space-y-1.5 border-t border-border pt-3">
          {annotations.map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-3 rounded-md bg-secondary/30 p-2 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <MarkChip a={a} />
                  <span className="font-medium">{a.mark_label}</span>
                </div>
                {a.excerpt ? (
                  <p className="italic text-muted-foreground">“{a.excerpt}”</p>
                ) : null}
                {a.comment ? <p>{a.comment}</p> : null}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0 text-destructive"
                onClick={() => removeAnnotation.mutate(a.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-1.5 border-t border-border pt-3">
        <Label htmlFor={`note-${submissionId}`}>Overall comment to the student</Label>
        <Textarea
          id={`note-${submissionId}`}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" onClick={() => saveNote.mutate()} disabled={saveNote.isPending}>
            Save comment
          </Button>
          <DraftStatus
            state={noteDraft.state}
            savedAt={noteDraft.savedAt}
            dirty={note.trim() !== (teacherNote ?? "").trim()}
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------- student view -------------------- */

export function ProofreadNotes({ submissionId }: { submissionId: string }) {
  const { data: annotations = [] } = useAnnotations(submissionId);
  if (annotations.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-md border border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Proofreading marks from your teacher
      </p>
      <ul className="space-y-1.5">
        {annotations.map((a) => (
          <li key={a.id} className="rounded bg-secondary/40 p-2 text-xs">
            <div className="flex items-center gap-2">
              <MarkChip a={a} />
              <Badge variant="outline">{a.mark_label}</Badge>
            </div>
            {a.excerpt ? <p className="mt-1 italic text-muted-foreground">“{a.excerpt}”</p> : null}
            {a.comment ? <p className="mt-1">{a.comment}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
