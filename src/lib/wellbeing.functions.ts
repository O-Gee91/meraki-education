import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WellbeingFeedItem = {
  id: string;
  studentId: string;
  studentName: string;
  mood: number;
  note: string | null;
  date: string;
  createdAt: string;
  response: {
    note: string;
    createdBy: string | null;
    responderName: string;
  } | null;
};

export const listWellbeingFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { date?: string }) => ({
    date: input.date?.trim() || undefined,
  }))
  .handler(async ({ data: input, context }) => {
    const { data: students, error: studentsError } = await context.supabase
      .from("students")
      .select("id, first_name, last_name");
    if (studentsError) throw new Error(`Could not load students: ${studentsError.message}`);

    const studentIds = (students ?? []).map((student) => student.id);
    if (studentIds.length === 0) return [] satisfies WellbeingFeedItem[];

    let checkinsQuery = context.supabase
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
    const { data: staffNotes, error: staffNotesError } = await context.supabase
      .from("checkin_staff_notes")
      .select("checkin_id, note, created_by")
      .in("checkin_id", checkinIds);
    if (staffNotesError) throw new Error(`Could not load teacher responses: ${staffNotesError.message}`);

    const responderIds = Array.from(
      new Set((staffNotes ?? []).flatMap((staffNote) => staffNote.created_by ? [staffNote.created_by] : [])),
    );
    const responderNames = new Map<string, string>();
    if (responderIds.length > 0) {
      const { data: profiles, error: profilesError } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", responderIds);
      if (profilesError) throw new Error(`Could not load responder names: ${profilesError.message}`);
      for (const profile of profiles ?? []) responderNames.set(profile.id, profile.full_name);
    }

    const studentsById = new Map(
      (students ?? []).map((student) => [student.id, `${student.first_name} ${student.last_name}`]),
    );
    const notesByCheckin = new Map((staffNotes ?? []).map((staffNote) => [staffNote.checkin_id, staffNote]));

    return checkins.map((checkin): WellbeingFeedItem => {
      const response = notesByCheckin.get(checkin.id);
      return {
        id: checkin.id,
        studentId: checkin.student_id,
        studentName: studentsById.get(checkin.student_id) ?? "Student",
        mood: Number(checkin.mood),
        note: checkin.note,
        date: checkin.date,
        createdAt: checkin.created_at,
        response: response
          ? {
              note: response.note,
              createdBy: response.created_by,
              responderName: response.created_by
                ? (responderNames.get(response.created_by) ?? "Meraki staff")
                : "Meraki staff",
            }
          : null,
      };
    });
  });