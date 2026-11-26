import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAll, fetchByIds, fetchChunks, mergeChunkTops } from "@/lib/query";

export type WellbeingResponse = {
  id: string;
  note: string;
  createdBy: string | null;
  responderName: string;
  createdAt: string;
};

export type WellbeingFeedItem = {
  id: string;
  studentId: string;
  studentName: string;
  mood: number;
  note: string | null;
  date: string;
  createdAt: string;
  responses: WellbeingResponse[];
};

export const listWellbeingFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { date?: string; teacherMode?: boolean }) => ({
    date: input.date?.trim() || undefined,
    teacherMode: input.teacherMode === true,
  }))
  .handler(async ({ data: input, context }) => {
    const { data: roleRows, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rolesError) throw new Error(`Could not verify access: ${rolesError.message}`);

    const roles = new Set((roleRows ?? []).map((row) => row.role));
    const isAdmin = roles.has("admin") && !input.teacherMode;
    const isTeacher = roles.has("teacher");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const allStudents = await fetchAll((from, to) =>
      supabaseAdmin
        .from("students")
        .select("id, first_name, last_name, grade_level, user_id, guardian_user_id")
        .order("id")
        .range(from, to),
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "unknown error";
      throw new Error(`Could not load students: ${message}`);
    });

    let students = allStudents ?? [];
    if (!isAdmin && isTeacher) {
      const [{ data: classes, error: classesError }, { data: coTeachers, error: coTeachersError }] = await Promise.all([
        supabaseAdmin.from("classes").select("id, teacher_id, grade_level"),
        context.supabase.from("class_co_teachers").select("class_id").eq("teacher_id", context.userId),
      ]);
      if (classesError) throw new Error(`Could not load teacher classes: ${classesError.message}`);
      if (coTeachersError) throw new Error(`Could not load co-taught classes: ${coTeachersError.message}`);

      const coTaughtClassIds = new Set((coTeachers ?? []).map((row) => row.class_id));
      // Authority comes only from verified class ownership or co-teacher membership,
      // never from editable display names.
      const teacherClasses = (classes ?? []).filter(
        (schoolClass) => schoolClass.teacher_id === context.userId
          || coTaughtClassIds.has(schoolClass.id),
      );
      // Grade-level outreach: teachers see students in the grades they verifiably teach.
      const gradeLevels = new Set(
        teacherClasses.flatMap((c) => (c.grade_level == null ? [] : [c.grade_level])),
      );
      const classIds = teacherClasses.map((schoolClass) => schoolClass.id);
      let rosterStudentIds = new Set<string>();
      if (classIds.length > 0) {
        const enrollments = await fetchByIds(classIds, (batch, from, to) =>
          supabaseAdmin
            .from("enrollments")
            .select("student_id")
            .in("class_id", batch)
            .order("student_id")
            .range(from, to),
        ).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "unknown error";
          throw new Error(`Could not load class rosters: ${message}`);
        });
        rosterStudentIds = new Set(enrollments.map((enrollment) => enrollment.student_id));
      }
      students = students.filter(
        (student) => rosterStudentIds.has(student.id)
          || (student.grade_level != null && gradeLevels.has(student.grade_level)),
      );
    } else if (!isAdmin) {
      students = students.filter(
        (student) => student.user_id === context.userId || student.guardian_user_id === context.userId,
      );
    }

    const studentIds = (students ?? []).map((student) => student.id);
    if (studentIds.length === 0) return [] satisfies WellbeingFeedItem[];

    const CHECKIN_CAP = 1000;
    const checkinRows = await fetchChunks(studentIds, async (batch) => {
      let checkinsQuery = supabaseAdmin
        .from("checkins")
        .select("id, student_id, mood, note, date, created_at")
        .in("student_id", batch)
        .order("created_at", { ascending: false })
        .limit(CHECKIN_CAP);
      if (input.date) checkinsQuery = checkinsQuery.eq("date", input.date);
      const { data, error } = await checkinsQuery;
      if (error) throw new Error(`Could not load check-ins: ${error.message}`);
      return data ?? [];
    });
    const checkins = mergeChunkTops([checkinRows], CHECKIN_CAP, (a, b) => b.created_at.localeCompare(a.created_at));
    if (!checkins.length) return [] satisfies WellbeingFeedItem[];

    const checkinIds = checkins.map((checkin) => checkin.id);
    const staffNotes = await fetchByIds(checkinIds, (batch, from, to) =>
      supabaseAdmin
        .from("checkin_staff_notes")
        .select("id, checkin_id, note, created_by, created_at")
        .in("checkin_id", batch)
        .order("created_at", { ascending: true })
        .order("id")
        .range(from, to),
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "unknown error";
      throw new Error(`Could not load teacher responses: ${message}`);
    });
    staffNotes.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));

    const responderIds = Array.from(
      new Set((staffNotes ?? []).flatMap((staffNote) => staffNote.created_by ? [staffNote.created_by] : [])),
    );
    const responderNames = new Map<string, string>();
    if (responderIds.length > 0) {
      const profiles = await fetchByIds(responderIds, (batch, from, to) =>
        supabaseAdmin.from("profiles").select("id, full_name").in("id", batch).order("id").range(from, to),
      ).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "unknown error";
        throw new Error(`Could not load responder names: ${message}`);
      });
      for (const profile of profiles) responderNames.set(profile.id, profile.full_name);
    }

    const studentsById = new Map(
      (students ?? []).map((student) => [student.id, `${student.first_name} ${student.last_name}`]),
    );
    const responsesByCheckin = new Map<string, WellbeingResponse[]>();
    for (const staffNote of staffNotes) {
      const list = responsesByCheckin.get(staffNote.checkin_id) ?? [];
      list.push({
        id: staffNote.id,
        note: staffNote.note,
        createdBy: staffNote.created_by,
        responderName: staffNote.created_by
          ? (responderNames.get(staffNote.created_by) ?? "Meraki staff")
          : "Meraki staff",
        createdAt: staffNote.created_at,
      });
      responsesByCheckin.set(staffNote.checkin_id, list);
    }

    return checkins.map((checkin): WellbeingFeedItem => ({
      id: checkin.id,
      studentId: checkin.student_id,
      studentName: studentsById.get(checkin.student_id) ?? "Student",
      mood: Number(checkin.mood),
      note: checkin.note,
      date: checkin.date,
      createdAt: checkin.created_at,
      responses: responsesByCheckin.get(checkin.id) ?? [],
    }));
  });