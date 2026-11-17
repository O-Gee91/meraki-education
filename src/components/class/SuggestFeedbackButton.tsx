import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { suggestFeedback } from "@/lib/feedback-ai.functions";

type Input = {
  assignmentTitle: string;
  studentFirstName?: string;
  gradeLevel?: number;
  score?: number | null;
  pointsPossible?: number | null;
  rubric?: { criterion: string; level?: string; descriptor?: string; earned?: number; max?: number }[];
  teacherNotes?: string;
};

/** Drafts an editable comment from score, rubric and the teacher's own notes. Never saves on its own. */
export function SuggestFeedbackButton({
  build,
  onSuggest,
  disabled,
}: {
  build: () => Input;
  onSuggest: (text: string) => void;
  disabled?: boolean;
}) {
  const run = useServerFn(suggestFeedback);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={disabled || busy}
      title="Uses the score, rubric and anything you've typed as notes"
      onClick={async () => {
        setBusy(true);
        try {
          const res = await run({ data: build() });
          if (res.error) toast.error(res.error);
          else {
            onSuggest(res.suggestion);
            toast.success("Suggestion added — edit it before saving");
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Couldn't draft a suggestion");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Sparkles className="size-4" /> {busy ? "Drafting…" : "Suggest comment"}
    </Button>
  );
}
