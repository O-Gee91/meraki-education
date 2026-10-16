import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractQuestions, type ImportedQuestion } from "@/lib/question-import.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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

const KIND_LABEL: Record<ImportedQuestion["kind"], string> = {
  multiple_choice: "Multiple choice",
  multi_select: "Select all",
  true_false: "True / False",
  short_answer: "Short answer",
  numeric: "Numeric",
  essay: "Essay",
};

function toBase64(buf: ArrayBuffer) {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function toRow(q: ImportedQuestion) {
  let answer_key: Record<string, unknown> = {};
  if (q.kind === "multiple_choice" || q.kind === "true_false") {
    answer_key = q.correct_choices.length ? { choice: q.correct_choices[0] } : { manual: true };
  } else if (q.kind === "multi_select") {
    answer_key = q.correct_choices.length ? { choices: [...q.correct_choices].sort() } : { manual: true };
  } else if (q.kind === "short_answer") {
    answer_key = q.accepted_answers.length ? { accepted: q.accepted_answers } : { manual: true };
  } else if (q.kind === "numeric") {
    answer_key = q.numeric_value != null ? { value: q.numeric_value, tolerance: 0 } : { manual: true };
  } else answer_key = { manual: true };
  return {
    kind: q.kind,
    prompt: q.prompt,
    options: q.options,
    answer_key,
    points: q.points,
    rubric: null,
    lock_order: false,
  };
}

export function ImportQuestionsDialog({
  assessmentId,
  startPosition,
  onImported,
}: {
  assessmentId: string;
  startPosition: number;
  onImported: () => void | Promise<void>;
}) {
  const extract = useServerFn(extractQuestions);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<ImportedQuestion[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  function reset() {
    setText("");
    setFile(null);
    setFound(null);
    setPicked(new Set());
  }

  async function read() {
    setBusy(true);
    try {
      let payload: { text?: string; fileName?: string; mimeType?: string; dataBase64?: string } = {};
      if (file) {
        const name = file.name.toLowerCase();
        if (name.endsWith(".docx")) {
          const mammoth = await import("mammoth");
          const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
          payload.text = value;
        } else if (name.endsWith(".pdf")) {
          if (file.size > 10 * 1024 * 1024) throw new Error("PDFs must be under 10 MB");
          payload = { fileName: file.name, mimeType: "application/pdf", dataBase64: toBase64(await file.arrayBuffer()) };
        } else if (name.endsWith(".txt")) {
          payload.text = await file.text();
        } else throw new Error("Use a Word (.docx), PDF or .txt file");
        if (text.trim()) payload.text = `${payload.text ?? ""}\n${text}`;
      } else payload.text = text;
      const res = await extract({ data: payload });
      setFound(res.questions);
      setPicked(new Set(res.questions.map((_, i) => i)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the document");
    } finally {
      setBusy(false);
    }
  }

  async function insert() {
    if (!found) return;
    const rows = found
      .filter((_, i) => picked.has(i))
      .map((q, i) => ({ assessment_id: assessmentId, position: startPosition + i, ...toRow(q) }));
    if (rows.length === 0) return;
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("assessment_questions").insert(rows as any);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${rows.length} question${rows.length === 1 ? "" : "s"} added`);
    await onImported();
    setOpen(false);
    reset();
  }

  function update(i: number, patch: Partial<ImportedQuestion>) {
    setFound((f) => f && f.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FileUp className="mr-1.5 h-4 w-4" /> Import questions
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import questions</DialogTitle>
          <DialogDescription>
            Upload a Word document or PDF, or paste questions. You review everything before it's added.
          </DialogDescription>
        </DialogHeader>

        {!found ? (
          <div className="space-y-3">
            <Input type="file" accept=".docx,.pdf,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Textarea
              rows={8}
              placeholder="…or paste questions here (include an answer key if you have one)"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {found.length} found · {picked.size} selected. Questions without a detected answer are marked for manual grading — edit them after import.
            </p>
            {found.map((q, i) => (
              <div key={i} className="rounded-md border p-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={picked.has(i)}
                    onCheckedChange={(v) =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (v) n.add(i); else n.delete(i);
                        return n;
                      })
                    }
                    aria-label={`Include question ${i + 1}`}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{KIND_LABEL[q.kind]}</Badge>
                      <Input
                        type="number"
                        className="h-7 w-20"
                        value={q.points}
                        min={0.5}
                        step={0.5}
                        onChange={(e) => update(i, { points: Number(e.target.value) || 1 })}
                        aria-label="Points"
                      />
                      <span className="text-xs text-muted-foreground">pts</span>
                    </div>
                    <Textarea rows={2} value={q.prompt} onChange={(e) => update(i, { prompt: e.target.value })} />
                    {q.options.length > 0 && (
                      <ul className="space-y-0.5 text-sm">
                        {q.options.map((o, j) => (
                          <li key={j} className={q.correct_choices.includes(j) ? "font-medium text-primary" : ""}>
                            {String.fromCharCode(65 + j)}. {o} {q.correct_choices.includes(j) && "✓"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          {found ? (
            <>
              <Button variant="ghost" onClick={() => setFound(null)} disabled={busy}>Back</Button>
              <Button onClick={insert} disabled={busy || picked.size === 0}>
                Add {picked.size} question{picked.size === 1 ? "" : "s"}
              </Button>
            </>
          ) : (
            <Button onClick={read} disabled={busy || (!file && text.trim().length < 10)}>
              {busy ? "Reading…" : "Find questions"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
