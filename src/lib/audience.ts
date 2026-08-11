export const AUDIENCES = [
  { value: "everyone", label: "Everyone" },
  { value: "students", label: "Students only" },
  { value: "parents", label: "Parents / guardians only" },
  { value: "teachers", label: "Teachers & staff only" },
] as const;

export type Audience = (typeof AUDIENCES)[number]["value"];

export function audienceLabel(value?: string | null) {
  return AUDIENCES.find((a) => a.value === value)?.label ?? "Everyone";
}
