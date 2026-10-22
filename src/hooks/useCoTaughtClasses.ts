import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Class ids where the signed-in staff member is a co-teacher. */
export async function fetchCoTaughtClassIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("class_co_teachers")
    .select("class_id")
    .eq("teacher_id", userId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.class_id));
}

export function useCoTaughtClassIds() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["co-taught-classes", user?.id],
    enabled: !!user,
    queryFn: () => fetchCoTaughtClassIds(user!.id),
  });
  return data ?? new Set<string>();
}
