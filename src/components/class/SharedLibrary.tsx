import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { copySharedResource } from "@/lib/sharing.functions";
import { questionCount, type SharedResource } from "@/lib/sharing";
import { formatDate } from "@/lib/school";

export function SharedLibrary({ classId }: { classId: string }) {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const copy = useServerFn(copySharedResource);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "assignment" | "assessment">("all");
  const [titles, setTitles] = useState<Record<string, string>>({});

  const { data: resources = [], isLoading } = useQuery({
    queryKey: ["shared-resources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shared_resources")
        .select(
          "id, kind, grade_level, subject, title, description, payload, shared_by, shared_by_name, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SharedResource[];
    },
  });

  const copyIn = useMutation({
    mutationFn: async (resource: SharedResource) => {
      const custom = titles[resource.id]?.trim();
      return copy({
        data: {
          resourceId: resource.id,
          classId,
          ...(custom && custom.length >= 2 ? { title: custom } : {}),
        },
      });
    },
    onSuccess: (result) => {
      toast.success(
        result.kind === "assignment"
          ? "Copied into this class as a new assignment — edit it freely."
          : "Copied into this class as a draft assessment — edit it freely.",
      );
      queryClient.invalidateQueries({ queryKey: ["assignments", classId] });
      queryClient.invalidateQueries({ queryKey: ["assessments", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unshare = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shared_resources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from the shared library");
      queryClient.invalidateQueries({ queryKey: ["shared-resources"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const term = search.trim().toLowerCase();
  const visible = resources.filter(
    (r) =>
      (kindFilter === "all" || r.kind === kindFilter) &&
      (term === "" ||
        r.title.toLowerCase().includes(term) ||
        (r.description ?? "").toLowerCase().includes(term) ||
        r.shared_by_name.toLowerCase().includes(term)),
  );

  return (
    <div className="mt-4 space-y-4">
      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-56 flex-1">
          <Input
            value={search}
            placeholder="Search shared assignments and assessments…"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everything</SelectItem>
            <SelectItem value="assignment">Assignments</SelectItem>
            <SelectItem value="assessment">Assessments</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="panel p-6 text-sm text-muted-foreground">Loading shared resources…</p>
      ) : visible.length === 0 ? (
        <p className="panel p-6 text-sm text-muted-foreground">
          Nothing shared for your grade yet. Use the Share button on any assignment or assessment to
          add the first one.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => (
            <li key={r.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{r.title}</h3>
                    <Badge variant="secondary">
                      {r.kind === "assignment" ? "Assignment" : "Assessment"}
                    </Badge>
                    <Badge variant="outline">
                      {r.grade_level ? `Grade ${r.grade_level}` : "All grades"}
                    </Badge>
                    {r.kind === "assessment" && (
                      <Badge variant="outline">{questionCount(r)} questions</Badge>
                    )}
                  </div>
                  {r.description ? (
                    <p className="mt-1 max-w-xl text-sm text-muted-foreground">{r.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Shared by {r.shared_by_name || "a teacher"} · {formatDate(r.created_at.slice(0, 10))}
                    {r.subject ? ` · ${r.subject}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="h-9 w-52"
                    placeholder="Rename your copy (optional)"
                    value={titles[r.id] ?? ""}
                    onChange={(e) => setTitles({ ...titles, [r.id]: e.target.value })}
                  />
                  <Button
                    size="sm"
                    onClick={() => copyIn.mutate(r)}
                    disabled={copyIn.isPending}
                  >
                    Copy into this class
                  </Button>
                  {(isAdmin || r.shared_by === user?.id) && (
                    <ConfirmDeleteButton
                      label="Unshare"
                      title={`Unshare “${r.title}”?`}
                      description="This removes it from the shared library. Copies other teachers already made stay untouched."
                      onConfirm={() => unshare.mutate(r.id)}
                    />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
