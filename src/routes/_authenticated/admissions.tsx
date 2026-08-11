import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/school";

export const Route = createFileRoute("/_authenticated/admissions")({
  head: () => ({
    meta: [
      { title: "Admissions — Meraki Education" },
      { name: "description", content: "Review and process new enrollment applications." },
      { property: "og:title", content: "Admissions — Meraki Education" },
      { property: "og:description", content: "Review and process new enrollment applications." },
    ],
  }),
  component: AdmissionsPage,
});

function AdmissionsPage() {
  const queryClient = useQueryClient();

  const { data: applications = [] } = useQuery({
    queryKey: ["applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select(
          "id, student_name, grade_level, guardian_name, guardian_email, phone, notes, status, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const setStatus = useMutation({
    mutationFn: async (input: { id: string; status: string }) => {
      const { error } = await supabase
        .from("applications")
        .update({ status: input.status })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Application updated");
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const admit = useMutation({
    mutationFn: async (app: (typeof applications)[number]) => {
      const [first, ...rest] = app.student_name.trim().split(" ");
      const { error } = await supabase.from("students").insert({
        first_name: (first ?? app.student_name).slice(0, 60),
        last_name: (rest.join(" ") || "—").slice(0, 60),
        grade_level: app.grade_level,
        guardian_email: app.guardian_email,
      });
      if (error) throw error;
      const { error: statusError } = await supabase
        .from("applications")
        .update({ status: "accepted" })
        .eq("id", app.id);
      if (statusError) throw statusError;
    },
    onSuccess: () => {
      toast.success("Student enrolled");
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Admissions"
      description="Applications submitted through the public enrollment form."
    >
      <div className="panel divide-y divide-border">
        {applications.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No applications yet.</p>
        ) : (
          applications.map((a) => (
            <article key={a.id} className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-semibold">{a.student_name}</h2>
                  <Badge variant={a.status === "accepted" ? "default" : "secondary"}>
                    {a.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Applied {formatDate(a.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Grade {a.grade_level} · {a.guardian_name} · {a.guardian_email}
                  {a.phone ? ` · ${a.phone}` : ""}
                </p>
                {a.notes ? <p className="mt-2 max-w-2xl text-sm">{a.notes}</p> : null}
              </div>
              <div className="flex gap-2">
                {a.status !== "accepted" && (
                  <Button size="sm" onClick={() => admit.mutate(a)} disabled={admit.isPending}>
                    Accept &amp; enroll
                  </Button>
                )}
                {a.status !== "waitlisted" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setStatus.mutate({ id: a.id, status: "waitlisted" })}
                  >
                    Waitlist
                  </Button>
                )}
                {a.status !== "declined" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStatus.mutate({ id: a.id, status: "declined" })}
                  >
                    Decline
                  </Button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </AppShell>
  );
}
