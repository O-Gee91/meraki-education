import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_MARKS,
  DEFAULT_SCALE,
  type GradingSetup,
  type SpecialMark,
  totalWeight,
} from "@/lib/grading";
import { GradingLibrary } from "@/components/class/GradingLibrary";

export function GradingSetupTab({
  classId,
  isStaff,
  setup,
  className = "This class",
}: {
  classId: string;
  isStaff: boolean;
  setup: GradingSetup;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<GradingSetup>(setup);

  useEffect(() => setDraft(setup), [setup]);

  const save = useMutation({
    mutationFn: async (next: GradingSetup) => {
      if (next.mode === "weighted" && Math.round(totalWeight(next.categories)) !== 100) {
        throw new Error("Category weights must add up to 100%");
      }
      if (next.categories.some((c) => !c.name.trim())) {
        throw new Error("Every category needs a name");
      }
      const { error } = await supabase
        .from("classes")
        .update({ weights: next as unknown as never })
        .eq("id", classId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Grading setup saved");
      queryClient.invalidateQueries({ queryKey: ["class", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const weightSum = totalWeight(draft.categories);

  if (!isStaff) {
    return (
      <div className="mt-4 space-y-4">
        <div className="panel p-5">
          <h3 className="font-semibold">How this class is graded</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {draft.mode === "weighted"
              ? "Weighted — each category counts for a set share of the final grade."
              : "Unweighted — every point counts the same."}
          </p>
          {draft.mode === "weighted" && (
            <ul className="mt-3 space-y-1 text-sm">
              {draft.categories.map((c) => (
                <li key={c.name} className="flex justify-between border-b border-border py-1">
                  <span>{c.name}</span>
                  <span className="font-medium">{c.weight}%</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel p-5">
          <h3 className="font-semibold">Grade scale</h3>
          <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            {draft.scale.map((b) => (
              <li key={b.letter} className="flex justify-between border-b border-border py-1">
                <span className="font-medium">{b.letter}</span>
                <span className="text-muted-foreground">{b.min}% and above</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel p-5">
          <h3 className="font-semibold">Special marks</h3>
          <ul className="mt-3 space-y-1 text-sm">
            {draft.marks.map((m) => (
              <li key={m.code} className="flex items-center gap-2 border-b border-border py-1">
                <Badge variant="secondary">{m.code}</Badge>
                <span>{m.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {markSummary(m)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="panel p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold">Grading method</h3>
            <p className="text-sm text-muted-foreground">
              Choose how assignment scores roll up into the class grade.
            </p>
          </div>
          <div className="w-56">
            <Label htmlFor="grading-mode">Method</Label>
            <Select
              value={draft.mode}
              onValueChange={(v) =>
                setDraft({ ...draft, mode: v as GradingSetup["mode"] })
              }
            >
              <SelectTrigger id="grading-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unweighted">Unweighted (total points)</SelectItem>
                <SelectItem value="weighted">Weighted by category</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="panel p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Categories</h3>
            <p className="text-sm text-muted-foreground">
              {draft.mode === "weighted"
                ? "Weights must total 100%."
                : "Weights are ignored while unweighted, but stay saved for later."}
            </p>
          </div>
          <Badge variant={weightSum === 100 ? "secondary" : "outline"}>
            {weightSum}% total
          </Badge>
        </div>
        <div className="mt-4 space-y-2">
          {draft.categories.map((cat, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                className="flex-1"
                value={cat.name}
                placeholder="Category name"
                onChange={(e) => {
                  const categories = [...draft.categories];
                  categories[i] = { ...cat, name: e.target.value };
                  setDraft({ ...draft, categories });
                }}
              />
              <Input
                className="w-24"
                inputMode="decimal"
                value={cat.weight}
                onChange={(e) => {
                  const categories = [...draft.categories];
                  categories[i] = { ...cat, weight: Number(e.target.value) || 0 };
                  setDraft({ ...draft, categories });
                }}
              />
              <span className="text-sm text-muted-foreground">%</span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove ${cat.name}`}
                onClick={() =>
                  setDraft({
                    ...draft,
                    categories: draft.categories.filter((_, idx) => idx !== i),
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDraft({
                ...draft,
                categories: [...draft.categories, { name: "", weight: 0 }],
              })
            }
          >
            <Plus className="mr-1 size-4" /> Add category
          </Button>
        </div>
      </div>

      <div className="panel p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Grade scale</h3>
            <p className="text-sm text-muted-foreground">
              Minimum percentage needed for each letter.
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDraft({ ...draft, scale: DEFAULT_SCALE })}
          >
            Reset to A–F
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {draft.scale.map((band, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                className="w-20"
                value={band.letter}
                maxLength={3}
                onChange={(e) => {
                  const scale = [...draft.scale];
                  scale[i] = { ...band, letter: e.target.value };
                  setDraft({ ...draft, scale });
                }}
              />
              <span className="text-sm text-muted-foreground">at or above</span>
              <Input
                className="w-24"
                inputMode="decimal"
                value={band.min}
                onChange={(e) => {
                  const scale = [...draft.scale];
                  scale[i] = { ...band, min: Number(e.target.value) || 0 };
                  setDraft({ ...draft, scale });
                }}
              />
              <span className="text-sm text-muted-foreground">%</span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove ${band.letter}`}
                onClick={() =>
                  setDraft({ ...draft, scale: draft.scale.filter((_, idx) => idx !== i) })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDraft({ ...draft, scale: [...draft.scale, { letter: "", min: 0 }] })
            }
          >
            <Plus className="mr-1 size-4" /> Add band
          </Button>
        </div>
      </div>

      <div className="panel p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Special marks</h3>
            <p className="text-sm text-muted-foreground">
              Type a code in any gradebook cell (for example <code>M</code>) instead of a
              score.
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDraft({ ...draft, marks: DEFAULT_MARKS })}
          >
            Reset defaults
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {draft.marks.map((mark, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input
                className="w-20"
                value={mark.code}
                maxLength={6}
                placeholder="Code"
                onChange={(e) => updateMark(i, { ...mark, code: e.target.value.toUpperCase() })}
              />
              <Input
                className="min-w-40 flex-1"
                value={mark.label}
                placeholder="Label"
                onChange={(e) => updateMark(i, { ...mark, label: e.target.value })}
              />
              <div className="w-48">
                <Select
                  value={mark.behavior}
                  onValueChange={(v) =>
                    updateMark(i, { ...mark, behavior: v as SpecialMark["behavior"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exclude">Not counted</SelectItem>
                    <SelectItem value="zero">Counts as zero</SelectItem>
                    <SelectItem value="value">Counts as % credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {mark.behavior === "value" && (
                <Input
                  className="w-24"
                  inputMode="decimal"
                  value={mark.value ?? 0}
                  onChange={(e) =>
                    updateMark(i, { ...mark, value: Number(e.target.value) || 0 })
                  }
                />
              )}
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove ${mark.code}`}
                onClick={() =>
                  setDraft({ ...draft, marks: draft.marks.filter((_, idx) => idx !== i) })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDraft({
                ...draft,
                marks: [...draft.marks, { code: "", label: "", behavior: "exclude" }],
              })
            }
          >
            <Plus className="mr-1 size-4" /> Add mark
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save grading setup"}
        </Button>
        <Button variant="outline" onClick={() => setDraft(setup)}>
          Discard changes
        </Button>
      </div>

      <GradingLibrary classId={classId} className={className} />
    </div>
  );

  function updateMark(index: number, next: SpecialMark) {
    const marks = [...draft.marks];
    marks[index] = next;
    setDraft({ ...draft, marks });
  }
}

function markSummary(mark: SpecialMark) {
  if (mark.behavior === "exclude") return "Not counted";
  if (mark.behavior === "zero") return "Counts as zero";
  return `Counts as ${mark.value ?? 0}% credit`;
}
