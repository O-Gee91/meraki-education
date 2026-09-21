import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

    const { data: allStudents, error: studentsError } = await supabaseAdmin
      .from("students")
      .select("id, first_name, last_name, grade_level, user_id, guardian_user_id");
    if (studentsError) throw new Error(`Could not load students: ${studentsError.message}`);

    let students = allStudents ?? [];
    if (!isAdmin && isTeacher) {
      const [{ data: classes, error: classesError }, { data: profile, error: profileError }] = await Promise.all([
        supabaseAdmin.from("classes").select("id, teacher_id, teacher_name, grade_level"),
        supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle(),
      ]);
      if (classesError) throw new Error(`Could not load teacher classes: ${classesError.message}`);
      if (profileError) throw new Error(`Could not load teacher profile: ${profileError.message}`);

      const teacherName = (profile?.full_name ?? "").trim().toLocaleLowerCase();
      const teacherClasses = (classes ?? []).filter(
        (schoolClass) => schoolClass.teacher_id === context.userId
          || (!!teacherName && schoolClass.teacher_name.trim().toLocaleLowerCase() === teacherName),
      );
      const classIds = teacherClasses.map((schoolClass) => schoolClass.id);
      const gradeLevels = new Set(
        teacherClasses.flatMap((schoolClass) => schoolClass.grade_level == null ? [] : [schoolClass.grade_level]),
      );
      let rosterStudentIds = new Set<string>();
      if (classIds.length > 0) {
        const { data: enrollments, error: enrollmentsError } = await supabaseAdmin
          .from("enrollments")
          .select("student_id")
          .in("class_id", classIds);
        if (enrollmentsError) throw new Error(`Could not load class rosters: ${enrollmentsError.message}`);
        rosterStudentIds = new Set((enrollments ?? []).map((enrollment) => enrollment.student_id));
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

    let checkinsQuery = supabaseAdmin
      .from("checkins")
      .select("id, student_id, mood, note, date, created_at")
      .in("student_id", studentIds)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (input.date) checkinsQuery = checkinsQuery.eq("date", input.date);

    const { data: checkins, error: checkinsError } = await checkinsQuery;
    if (checkinsError) throw new Error(`Could not load check-ins: ${checkinsError.message}`);
    if (!checkins?.length) return [] satisfies WellbeingFeedItem[];

    const checkinIds = checkins.map((checkin) => checkin.id);
    const { data: staffNotes, error: staffNotesError } = await supabaseAdmin
      .from("checkin_staff_notes")
      .select("id, checkin_id, note, created_by, created_at")
      .in("checkin_id", checkinIds)
      .order("created_at", { ascending: true });
    if (staffNotesError) throw new Error(`Could not load teacher responses: ${staffNotesError.message}`);

    const responderIds = Array.from(
      new Set((staffNotes ?? []).flatMap((staffNote) => staffNote.created_by ? [staffNote.created_by] : [])),
    );
    const responderNames = new Map<string, string>();
    if (responderIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", responderIds);
      if (profilesError) throw new Error(`Could not load responder names: ${profilesError.message}`);
      for (const profile of profiles ?? []) responderNames.set(profile.id, profile.full_name);
    }

    const studentsById = new Map(
      (students ?? []).map((student) => [student.id, `${student.first_name} ${student.last_name}`]),
    );
    const responsesByCheckin = new Map<string, WellbeingResponse[]>();
    for (const staffNote of staffNotes ?? []) {
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