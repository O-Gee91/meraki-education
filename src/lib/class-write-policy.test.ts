import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const drizzle = readFileSync("drizzle/migrations/0045_class_scoped_grade_and_attendance_writes.sql", "utf8");
const supabase = readFileSync("supabase/migrations/20261127180000_class_scoped_grade_and_attendance_writes.sql", "utf8");

describe("class-scoped grade and attendance writes", () => {
  it("ships the same policy migration in both trees", () => {
    expect(supabase).toBe(drizzle);
  });

  it("requires class and student permission for grade writes", () => {
    for (const name of ["grades insert staff", "grades update staff", "grades delete staff"]) {
      expect(drizzle).toContain(`DROP POLICY IF EXISTS "${name}" ON public.grades`);
      expect(drizzle).toContain(`CREATE POLICY "${name}"`);
    }
    expect(drizzle).toContain("public.can_manage_student(student_id)");
    expect(drizzle).toContain("public.can_manage_class(a.class_id)");
    expect(drizzle).not.toContain('DROP POLICY IF EXISTS "grades read"');
  });

  it("requires class and student permission for attendance changes", () => {
    expect(drizzle).toContain('DROP POLICY IF EXISTS "attendance update staff"');
    expect(drizzle).toContain('DROP POLICY IF EXISTS "attendance delete staff"');
    expect(drizzle).toContain("public.can_manage_class(class_id) AND public.can_manage_student(student_id)");
    expect(drizzle).not.toContain("public.is_staff()");
  });
});
