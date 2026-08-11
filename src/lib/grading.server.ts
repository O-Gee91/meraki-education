import type { AnswerKey, AnswerResponse, QuestionKind } from "./assessments";

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns null when the question needs human/AI review (essays). */
export function autoGrade(
  kind: QuestionKind,
  key: AnswerKey,
  response: AnswerResponse,
  points: number,
): { isCorrect: boolean; pointsAwarded: number } | null {
  switch (kind) {
    case "multiple_choice":
    case "true_false": {
      const correct = response.choice != null && response.choice === key.choice;
      return { isCorrect: correct, pointsAwarded: correct ? points : 0 };
    }
    case "multi_select": {
      const expected = [...(key.choices ?? [])].sort();
      const given = [...(response.choices ?? [])].sort();
      const correct =
        expected.length > 0 &&
        expected.length === given.length &&
        expected.every((v, i) => v === given[i]);
      return { isCorrect: correct, pointsAwarded: correct ? points : 0 };
    }
    case "short_answer": {
      const given = normalize(response.text ?? "");
      const correct =
        given.length > 0 && (key.accepted ?? []).some((a) => normalize(a) === given);
      return { isCorrect: correct, pointsAwarded: correct ? points : 0 };
    }
    case "numeric": {
      const tolerance = Math.abs(key.tolerance ?? 0);
      const correct =
        response.value != null &&
        key.value != null &&
        Math.abs(response.value - key.value) <= tolerance;
      return { isCorrect: correct, pointsAwarded: correct ? points : 0 };
    }
    default:
      return null;
  }
}
