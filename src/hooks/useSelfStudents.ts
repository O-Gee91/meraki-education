import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type SelfStudent = {
  id: string;
  first_name: string;
  last_name: string;
  grade_level: number | null;
};

/**
 * The student records the current viewer may see as "their own":
 * - students: their linked record
 * - guardians: every linked child
 * - staff in "View as student": only the demo Student Tester
 * Staff RLS can read every student, so student-facing screens must filter by
 * these ids rather than trusting RLS while a preview is active.
 */
export function useSelfStudents() {
  const { user, primaryRole, previewingStudent } = useAuth();
  const query = useQuery({
    queryKey: ["self-students", user?.id, primaryRole, previewingStudent],
    enabled: !!user,
    queryFn: async (): Promise<SelfStudent[]> => {
      let q = supabase.from("students").select("id, first_name, last_name, grade_level");
      if (previewingStudent) q = q.eq("is_tester", true).limit(1);
      else if (primaryRole === "parent") q = q.eq("guardian_user_id", user!.id);
      else q = q.eq("user_id", user!.id);
      const { data, error } = await q.order("last_name");
      if (error) throw error;
      return (data ?? []) as SelfStudent[];
    },
  });
  const students = query.data ?? [];
  return { students, ids: students.map((s) => s.id), isLoading: query.isLoading };
}
