import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Upload, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { digitizeRubric } from "@/lib/rubrics.functions";
import {
  blankCriterion,
  blankRubricCriteria,
  criterionMax,
  parseCriteria,
  rubricTotal,
  type RubricCriterion,
  type RubricRow,
} from "@/lib/rubrics";

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file could not be read"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function RubricEditor({
  classId,
  gradeLevel,
  subject,
  rubric,
  triggerLabel,
  triggerVariant = "default",
}: {
  classId: string;
  gradeLevel?: number | null | undefined;
  subject?: string | null | undefined;
  rubric?: RubricRow | undefined;
  triggerLabel?: string | undefined;
  triggerVariant?: "default" | "outline" | "ghost" | undefined;
}) {
  const queryClient = useQueryClient();
  const digitize = useServerFn(digitizeRubric);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(rubric?.title ?? "");
  const [description, setDescription] = useState(rubric?.description ?? "");
  const [criteria, setCriteria] = useState<RubricCriterion[]>(
    rubric ? parseCriteria(rubric.criteria) : blankRubricCriteria(),
  );
  const [pastedText, setPastedText] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(rubric?.title ?? "");
    setDescription(rubric?.description ?? "");
    setCriteria(rubric ? parseCriteria(rubric.criteria) : blankRubricCriteria());
    setPastedText("");
  }, [open, rubric]);

  const total = rubricTotal(criteria);

  const importRubric = useMutation({
    mutationFn: async (payload: { file?: File; text?: string }) => {
      if (payload.file) {
        if (payload.file.size > 8 * 1024 * 1024)
          throw new Error("Please use a file smaller than 8 MB");
        const dataBase64 = await toBase64(payload.file);
        return digitize({
          data: {
            fileName: payload.file.name,
            mimeType: payload.file.type || "application/octet-stream",
            dataBase64,
          },
        });
      }
      return digitize({ data: { text: payload.text ?? "" } });
    },
    onSuccess: (result) => {
      setTitle((t) => t || result.title);
      setDescription((d) => d || result.description);
      setCriteria(result.criteria);
      toast.success("Rubric read in — check the rows and points, then save");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (title.trim().length < 2) throw new Error("Give the rubric a name");
      const cleaned = criteria
        .map((c) => ({ ...c, title: c.title.trim() }))
        .filter((c) => c.title.length > 0);
      if (cleaned.length === 0) throw new Error("Add at least one row to the rubric");
      const row = {
        title: title.trim().slice(0, 140),
        description: description.trim().slice(0, 1000) || null,
        criteria: cleaned as unknown as never,
        total_points: rubricTotal(cleaned),
      };
      if (rubric) {
        const { error } = await supabase.from("rubrics").update(row).eq("id", rubric.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rubrics").insert({
          ...row,
          class_id: classId,
          grade_level: gradeLevel ?? null,
          subject: subject ?? null,
          created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(rubric ? "Rubric updated" : "Rubric created");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["rubrics", classId] });
      queryClient.invalidateQueries({ queryKey: ["rubric", rubric?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function updateCriterion(index: number, next: Partial<RubricCriterion>) {
    setCriteria((list) => list.map((c, i) => (i === index ? { ...c, ...next } : c)));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={triggerVariant}>
          {triggerLabel ?? (rubric ? "Edit rubric" : "New rubric")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{rubric ? "Edit rubric" : "Create a rubric"}</DialogTitle>
          <DialogDescription>
            Build the rows and levels yourself, or upload a rubric you already have and let the
            site turn it into an editable, scoreable version.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          {!rubric && (
            <div className="rounded-lg border border-dashed border-border p-3">
              <p className="text-sm font-medium">Have a rubric already?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload a photo, scan or document of it — or paste the wording — and it becomes an
                editable rubric below.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Label
                  htmlFor="rubric-upload"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs"
                >
                  <Upload className="h-3.5 w-3.5" /> Choose file
                </Label>
                <input
                  id="rubric-upload"
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) importRubric.mutate({ file });
                  }}
                />
                {importRubric.isPending && (
                  <span className="text-xs text-muted-foreground">Reading the rubric…</span>
                )}
              </div>
              <Textarea
                className="mt-2"
                placeholder="…or paste the rubric text here"
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={importRubric.isPending || pastedText.trim().length < 20}
                onClick={() => importRubric.mutate({ text: pastedText })}
              >
                <Wand2 className="mr-1 size-4" /> Turn text into a rubric
              </Button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rubric-title">Rubric name</Label>
              <Input
                id="rubric-title"
                value={title}
                maxLength={140}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rubric-desc">What it is for (optional)</Label>
              <Input
                id="rubric-desc"
                value={description}
                maxLength={200}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            {criteria.map((c, index) => (
              <div key={c.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-48 flex-1 space-y-1.5">
                    <Label htmlFor={`crit-${c.id}`}>Row {index + 1}</Label>
                    <Input
                      id={`crit-${c.id}`}
                      placeholder="What is being judged (e.g. Evidence & support)"
                      value={c.title}
                      maxLength={160}
                      onChange={(e) => updateCriterion(index, { title: e.target.value })}
                    />
                  </div>
                  <div className="pt-7 text-xs text-muted-foreground">
                    {criterionMax(c)} pts max
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="mt-6"
                    onClick={() => setCriteria((l) => l.filter((_, i) => i !== index))}
                    aria-label="Remove row"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {c.levels.map((lv, li) => (
                    <div key={li} className="rounded-md border border-border/70 p-2">
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-8"
                          value={lv.label}
                          maxLength={60}
                          onChange={(e) =>
                            updateCriterion(index, {
                              levels: c.levels.map((x, i) =>
                                i === li ? { ...x, label: e.target.value } : x,
                              ),
                            })
                          }
                        />
                        <Input
                          className="h-8 w-20"
                          inputMode="decimal"
                          value={String(lv.points)}
                          onChange={(e) =>
                            updateCriterion(index, {
                              levels: c.levels.map((x, i) =>
                                i === li
                                  ? { ...x, points: Number(e.target.value) || 0 }
                                  : x,
                              ),
                            })
                          }
                        />
                      </div>
                      <Textarea
                        className="mt-2 min-h-16 text-xs"
                        placeholder="What this level looks like"
                        value={lv.descriptor}
                        maxLength={600}
                        onChange={(e) =>
                          updateCriterion(index, {
                            levels: c.levels.map((x, i) =>
                              i === li ? { ...x, descriptor: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCriteria((l) => [...l, blankCriterion()])}
            >
              <Plus className="mr-1 size-4" /> Add row
            </Button>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {criteria.length} rows · {total} points in total
          </span>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : rubric ? "Save rubric" : "Create rubric"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
