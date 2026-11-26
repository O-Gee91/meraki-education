import { z } from "zod";

export const resetAccountInput = z.object({
  user_id: z.string().uuid(),
  new_username: z.string().max(30).nullish(),
  new_email: z.string().trim().email().max(255).or(z.literal("")).nullish(),
});

export const linkAccountInput = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["student", "parent"]),
  student_id: z.string().uuid().nullish(),
  class_id: z.string().uuid().nullish(),
  grade_level: z.number().int().min(1).max(12).nullish(),
  first_name: z.string().max(60).nullish(),
  last_name: z.string().max(60).nullish(),
  student_number: z.string().max(20).nullish(),
});

export const provisionAccountsInput = z.object({
  entries: z.array(z.object({
    student_id: z.string().uuid(),
    first_name: z.string().max(60),
    last_name: z.string().max(60),
    student_email: z.string().max(255).nullish(),
    guardian_email: z.string().max(255).nullish(),
    student_username: z.string().max(30).nullish(),
    guardian_username: z.string().max(30).nullish(),
    student_user_id: z.string().uuid().nullish(),
    guardian_user_id: z.string().uuid().nullish(),
    reset_existing: z.boolean().optional(),
  })).min(1).max(200),
});