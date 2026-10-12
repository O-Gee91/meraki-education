import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type RequestRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  note: string | null;
  status: string;
  created_at: string;
};

export function StaffRequests({ enabled, desktopReview = false }: { enabled: boolean; desktopReview?: boolean }) {
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["staff-access-requests"],
    enabled,
    queryFn: async (): Promise<RequestRow[]> => {
      const { data, error } = await supabase
        .from("staff_access_requests")
        .select("id, user_id, full_name, email, note, status, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const review = useMutation({
    mutationFn: async ({ row, approve }: { row: RequestRow; approve: boolean }) => {
      if (approve) {
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({ user_id: row.user_id, role: "teacher" });
        if (roleError && roleError.code !== "23505") throw roleError;
      }
      const { error } = await supabase
        .from("staff_access_requests")
        .update({
          status: approve ? "approved" : "denied",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["staff-access-requests"] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.success(
        variables.approve ? "Educator access approved" : "Educator request declined",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!enabled) return null;

  return (
    <section className={desktopReview ? "min-w-0 border-b border-border pb-5" : "panel p-5"}>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Educator access requests</h2>
        <Badge variant="secondary">{requests.length}</Badge>
      </div>
      {!desktopReview && <p className="mt-1 text-xs text-muted-foreground">
        Staff who signed up with an email outside the approved school domains stay as
        non-staff accounts until an administrator approves them here.
      </p>}

      <div className="mt-4 divide-y divide-border">
        {isLoading ? (
          <p className="py-4 text-sm text-muted-foreground">Loading requests…</p>
        ) : requests.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No requests waiting for review.</p>
        ) : (
          requests.map((row) => (
            <div
              key={row.id}
              className={desktopReview ? "grid min-w-0 items-start gap-3 py-4 xl:grid-cols-[minmax(0,1fr)_27rem] xl:gap-6" : "flex flex-wrap items-start justify-between gap-3 py-4"}
            >
              <div className={desktopReview ? "min-w-0 [overflow-wrap:anywhere]" : "min-w-0"}>
                <p className="text-sm font-semibold">{row.full_name || "Unnamed"}</p>
                <p className={desktopReview ? "mt-1 text-xs text-muted-foreground" : "truncate text-xs text-muted-foreground"}>{row.email}</p>
                {row.note ? (
                  <p className="mt-1 max-w-prose text-xs text-muted-foreground">“{row.note}”</p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={review.isPending}
                  onClick={() => review.mutate({ row, approve: true })}
                >
                  Approve as teacher
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={review.isPending}
                  onClick={() => review.mutate({ row, approve: false })}
                >
                  Decline
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
