import { useState } from "react";
import { Plus, X, Calculator, RotateCcw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ScoringCriterion = {
  id: string;
  name: string;
  score: number | null;
};

type PickerStyle = "dropdown" | "slider" | "stars";

const SCALE_LABELS: Record<number, Record<number, string>> = {
  5: { 1: "Poor", 2: "Fair", 3: "Good", 4: "Very good", 5: "Excellent" },
  10: {
    1: "Poor",
    2: "Weak",
    3: "Developing",
    4: "Fair",
    5: "Satisfactory",
    6: "Good",
    7: "Strong",
    8: "Very good",
    9: "Excellent",
    10: "Outstanding",
  },
};

function newCriterion(): ScoringCriterion {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: "", score: null };
}

function defaultCriteria(count = 4): ScoringCriterion[] {
  return Array.from({ length: count }, newCriterion);
}

export function DynamicScoringInterface({
  title = "Dynamic Scoring",
  description = "Add criteria, choose a score for each, and calculate the total.",
  showAverage = true,
  onSubmit,
}: {
  title?: string;
  description?: string;
  showAverage?: boolean;
  onSubmit?: (payload: { criteria: ScoringCriterion[]; total: number; average: number }) => void;
}) {
  const [criteria, setCriteria] = useState<ScoringCriterion[]>(() => defaultCriteria(4));
  const [maxScore, setMaxScore] = useState<5 | 10>(5);
  const [picker, setPicker] = useState<PickerStyle>("dropdown");
  const [result, setResult] = useState<{ total: number; average: number; scored: number } | null>(
    null,
  );

  const labels = SCALE_LABELS[maxScore] ?? {};
  const rangeLabel = `Score (1–${maxScore})`;
  const scoreOptions = Array.from({ length: maxScore }, (_, i) => i + 1);

  const scored = criteria.filter((c) => c.score !== null && c.name.trim().length > 0);
  const allNamed = criteria.every((c) => c.name.trim().length > 0);

  function addCriterion() {
    setCriteria((list) => [...list, newCriterion()]);
    setResult(null);
  }

  function removeCriterion(id: string) {
    setCriteria((list) => list.filter((c) => c.id !== id));
    setResult(null);
  }

  function updateCriterion(id: string, patch: Partial<ScoringCriterion>) {
    setCriteria((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setResult(null);
  }

  function changeScale(next: 5 | 10) {
    setMaxScore(next);
    setCriteria((list) =>
      list.map((c) => (c.score !== null && c.score > next ? { ...c, score: next } : c)),
    );
    setResult(null);
  }

  function calculate() {
    const valid = criteria.filter((c) => c.score !== null && c.name.trim().length > 0);
    const total = valid.reduce((sum, c) => sum + (c.score ?? 0), 0);
    const average = valid.length > 0 ? total / valid.length : 0;
    setResult({ total, average, scored: valid.length });
    onSubmit?.({ criteria: valid, total, average });
  }

  function reset() {
    setCriteria(defaultCriteria(4));
    setResult(null);
  }

  return (
    <Card className="mx-auto w-full max-w-3xl shadow-panel">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-semibold tracking-tight">{title}</CardTitle>
            <CardDescription className="mt-1.5">{description}</CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0">
            Total criteria: {criteria.length}
          </Badge>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4 rounded-lg border border-border bg-muted/40 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="score-scale">Scoring range</Label>
            <Select
              value={String(maxScore)}
              onValueChange={(v) => changeScale(Number(v) === 10 ? 10 : 5)}
            >
              <SelectTrigger id="score-scale" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">1 – 5</SelectItem>
                <SelectItem value="10">1 – 10</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="score-picker">How to pick scores</Label>
            <Select value={picker} onValueChange={(v) => setPicker(v as PickerStyle)}>
              <SelectTrigger id="score-picker" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dropdown">Dropdown</SelectItem>
                <SelectItem value="stars">Star rating</SelectItem>
                <SelectItem value="slider">Slider</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-3">
          {criteria.map((criterion, index) => (
            <div
              key={criterion.id}
              className="relative rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-sm"
            >
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => removeCriterion(criterion.id)}
                aria-label={`Remove criterion ${index + 1}`}
                disabled={criteria.length <= 1}
              >
                <X className="h-4 w-4" />
              </Button>

              <div className="flex flex-col gap-4 pr-8 sm:flex-row sm:items-start">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor={`criterion-name-${criterion.id}`}>Criterion {index + 1}</Label>
                  <Input
                    id={`criterion-name-${criterion.id}`}
                    placeholder="Describe what is being scored"
                    value={criterion.name}
                    onChange={(e) => updateCriterion(criterion.id, { name: e.target.value })}
                    maxLength={200}
                  />
                </div>

                <div className="w-full space-y-1.5 sm:w-56">
                  <Label htmlFor={`criterion-score-${criterion.id}`}>{rangeLabel}</Label>

                  {picker === "dropdown" && (
                    <Select
                      value={criterion.score === null ? undefined : String(criterion.score)}
                      onValueChange={(value) =>
                        updateCriterion(criterion.id, { score: Number(value) })
                      }
                    >
                      <SelectTrigger id={`criterion-score-${criterion.id}`}>
                        <SelectValue placeholder="Select score" />
                      </SelectTrigger>
                      <SelectContent>
                        {scoreOptions.map((score) => (
                          <SelectItem key={score} value={String(score)}>
                            {score}
                            {labels[score] ? ` – ${labels[score]}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {picker === "stars" && (
                    <div id={`criterion-score-${criterion.id}`}>
                      <div className="flex flex-wrap items-center gap-1">
                        {scoreOptions.map((score) => {
                          const active = criterion.score !== null && score <= criterion.score;
                          return (
                            <button
                              key={score}
                              type="button"
                              aria-label={`Score ${score} of ${maxScore}`}
                              aria-pressed={criterion.score === score}
                              onClick={() => updateCriterion(criterion.id, { score })}
                              className="rounded p-0.5 transition hover:scale-110"
                            >
                              <Star
                                className={cn(
                                  "h-5 w-5",
                                  active
                                    ? "fill-warning text-warning"
                                    : "text-muted-foreground/40",
                                )}
                              />
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {criterion.score === null
                          ? "Select score"
                          : `${criterion.score}/${maxScore}${
                              labels[criterion.score] ? ` · ${labels[criterion.score]}` : ""
                            }`}
                      </p>
                    </div>
                  )}

                  {picker === "slider" && (
                    <div id={`criterion-score-${criterion.id}`} className="pt-2">
                      <Slider
                        min={1}
                        max={maxScore}
                        step={1}
                        value={[criterion.score ?? 1]}
                        onValueChange={(v) =>
                          updateCriterion(criterion.id, { score: v[0] ?? 1 })
                        }
                      />
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {criterion.score === null
                          ? "Select score — drag to choose"
                          : `${criterion.score}/${maxScore}${
                              labels[criterion.score] ? ` · ${labels[criterion.score]}` : ""
                            }`}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button onClick={addCriterion} className="w-full sm:w-auto">
          <Plus className="mr-1.5 h-4 w-4" /> Add criteria
        </Button>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {scored.length} of {criteria.length} criteria scored
            {!allNamed && (
              <span className="ml-2 text-destructive">
                · Name every criterion before calculating
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="mr-1.5 h-4 w-4" /> Reset
            </Button>
            <Button onClick={calculate} disabled={scored.length === 0 || !allNamed}>
              <Calculator className="mr-1.5 h-4 w-4" /> Calculate total
            </Button>
          </div>
        </div>

        {result && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-primary/10 p-4 text-center">
              <div className="text-xs font-medium uppercase tracking-wide text-primary/80">
                Total score
              </div>
              <div className="mt-1 text-3xl font-bold text-primary">
                {result.total.toFixed(1)} / {result.scored * maxScore}
              </div>
            </div>
            {showAverage && (
              <div className="rounded-xl bg-accent/15 p-4 text-center">
                <div className="text-xs font-medium uppercase tracking-wide text-accent-foreground/80">
                  Average
                </div>
                <div className="mt-1 text-3xl font-bold text-accent-foreground">
                  {result.average.toFixed(2)}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
