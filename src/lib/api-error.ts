import { z } from "zod";

/** Codes a privileged server handler may throw. Data API responses keep PostgREST's own body. */
export const API_CODES = [
  "validation",
  "unauthorized",
  "forbidden",
  "conflict",
  "not_found",
  "failed",
] as const;

export type ApiCode = (typeof API_CODES)[number];

/**
 * Small failure envelope for write and other privileged server handlers.
 * `message` is safe to show. Callers still read `error.message`.
 */
export class ApiError extends Error {
  readonly code: ApiCode;

  constructor(code: ApiCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }

  toJSON() {
    return { code: this.code, message: this.message };
  }
}

/** Map a Zod failure to `{ code: "validation", message }` instead of a raw issue list. */
export function parseApiInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(
      "validation",
      parsed.error.issues[0]?.message || "Check the information and try again.",
    );
  }
  return parsed.data;
}

/** Map Postgres unique_violation (23505) to conflict. Every other database error is failed. */
export function apiErrorFromDb(
  error: { message?: string; code?: string },
  conflictMessage?: string,
): ApiError {
  const message = error.message?.trim() || "The request didn't go through. Try again.";
  if (error.code === "23505") return new ApiError("conflict", conflictMessage ?? message);
  return new ApiError("failed", message);
}
