import { useState } from "react";
import { Plus, Trash2, Calculator, RotateCcw } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ScoreRange = {
  min: number;
  max: number;
  /** Label shown next to the score picker, e.g. "Score (1–5)". */
  label: string;
  /** Optional descriptions keyed by score value. */
  descriptions?: Record<number, string>;
};

export type ScoringCriterion = {
  id: string;
  name: string;
  score: number | null;
};

const DEFAULT_RANGE: ScoreRange = {
  min: 1,
  max: 5,
  label: "Score (1–5)",
  descriptions: {
    1: "Poor",
    2: "Fair",
    3: "Good",
    4: "Very good",
    5: "Excellent",
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
  range = DEFAULT_RANGE,
  showAverage = true,
  onSubmit,
}: {
  title?: string;
  description?: string;
  range?: ScoreRange;
  showAverage?: boolean;
  onSubmit?: (payload: { criteria: ScoringCriterion[]; total: number; average: number }) => void;
}) {
  const [criteria, setCriteria] = useState<ScoringCriterion[]>(() => defaultCriteria(4));
  const [result, setResult] = useState<{ total: number; average: number; scored: number } | null>(null);

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

  function calculate() {
    const valid = criteria.filter((c) => c.score !== null && c.name.trim().length > 0);
    const total = valid.reduce((sum, c) => sum + (c.score ?? 0), 0);
    const average = valid.length > 0 ? total / valid.length : 0;
    const payload = { criteria: valid, total, average };
    setResult({ total, average, scored: valid.length });
    onSubmit?.(payload);
  }

  function reset() {
    setCriteria(defaultCriteria(4));
    setResult(null);
  }

  const scoreOptions = Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i);

  return (
    <Card className="w-full max-w-3xl mx-auto shadow-panel">
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
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-3">
          {criteria.map((criterion, index) => (
            <div
              key={criterion.id}
              className="rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor={`criterion-name-${criterion.id}`}>
                    Criterion {index + 1}
                  </Label>
                  <Input
                    id={`criterion-name-${criterion.id}`}
                    placeholder="Describe what is being scored"
                    value={criterion.name}
                    onChange={(e) =>
                      updateCriterion(criterion.id, { name: e.target.value })
                    }
                    maxLength={200}
                  />
                </div>

                <div className="w-full sm:w-44 space-y-1.5">
                  <Label htmlFor={`criterion-score-${criterion.id}`}>{range.label}</Label>
                  <Select
                    value={criterion.score === null ? "" : String(criterion.score)}
                    onValueChange={(value) =>
                      updateCriterion(criterion.id, { score: value === "" ? null : Number(value) })
                    }
                  >
                    <SelectTrigger id={`criterion-score-${criterion.id}`}>
                      <SelectValue placeholder="Select score" />
                    </SelectTrigger>
                    <SelectContent>
                      {scoreOptions.map((score) => (
                        <SelectItem key={score} value={String(score)}>
                          <span className="inline-flex items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
                                score >= range.max - 1
                                  ? "bg-success text-success-foreground"
                                  : score >= range.min + 2
                                    ? "bg-warning text-warning-foreground"
                                    : "bg-muted text-muted-foreground",
                              )}
                            >
                              {score}
                            </span>
                            {range.descriptions?.[score] ?? `Score ${score}`}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => removeCriterion(criterion.id)}
                    aria-label={`Remove criterion ${index + 1}`}
                    disabled={criteria.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button onClick={addCriterion} className="w-full sm:w-auto">
          <Plus className="mr-1.5 h-4 w-4" /> Add criteria
        </Button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-border bg-muted/40 p-4">
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
                {result.total.toFixed(1)}
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
