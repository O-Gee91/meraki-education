import { Suspense, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { listFeatureFlags, updateFeatureFlag } from "@/lib/feature-flags.functions";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Flag = Database["public"]["Tables"]["feature_flags"]["Row"];
type Option = { id: string; label: string };

export function FeatureFlagsPanel() {
  const { isAdmin, previewingStudent } = useAuth();
  if (!isAdmin || previewingStudent) return null;
  return <section aria-labelledby="feature-flags-heading" className="mt-10 border-t border-border pt-8">
    <h2 id="feature-flags-heading" className="text-lg font-semibold">Feature flags</h2>
    <Suspense fallback={<p className="mt-4 text-sm text-muted-foreground">Loading feature switches…</p>}>
      <FlagList />
    </Suspense>
  </section>;
}

function FlagList() {
  const { user } = useAuth();
  const list = useServerFn(listFeatureFlags);
  const { data } = useSuspenseQuery({ queryKey: ["admin-feature-flags", user?.id], queryFn: () => list(), staleTime: 60_000 });
  return <div className="mt-4 divide-y divide-border">
    {data.flags.map((flag) => <FlagEditor key={`${flag.key}:${flag.updated_at}`} flag={flag}
      users={data.users.map((u) => ({ id: u.id, label: u.full_name || "Unnamed account" }))}
      classes={data.classes.map((c) => ({ id: c.id, label: c.name }))} />)}
    {data.flags.length === 0 && <p className="text-sm text-muted-foreground">No feature switches available.</p>}
  </div>;
}

function FlagEditor({ flag, users, classes }: { flag: Flag; users: Option[]; classes: Option[] }) {
  const [enabled, setEnabled] = useState(flag.enabled);
  const [scope, setScope] = useState(flag.scope);
  const [userIds, setUserIds] = useState(flag.target_user_ids);
  const [classIds, setClassIds] = useState(flag.target_class_ids);
  const queryClient = useQueryClient();
  const update = useServerFn(updateFeatureFlag);
  const save = useMutation({
    mutationFn: () => update({ data: { key: flag.key, enabled, scope: scope as "all" | "staff_only" | "pilot_only", target_user_ids: userIds, target_class_ids: classIds } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-feature-flags"] }),
        queryClient.invalidateQueries({ queryKey: ["feature-flags"] }),
      ]);
      toast.success("Feature switch saved");
    },
    onError: () => toast.error("Couldn't save the feature switch. Your changes have not been applied."),
  });
  const dirty = enabled !== flag.enabled || scope !== flag.scope || JSON.stringify(userIds) !== JSON.stringify(flag.target_user_ids) || JSON.stringify(classIds) !== JSON.stringify(flag.target_class_ids);
  return <div className="max-w-3xl space-y-4 py-5">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={`flag-${flag.key}`} className="text-base font-medium">{flag.name}</Label>
        <p className="mt-1 text-sm text-muted-foreground">{flag.description}</p>
      </div>
      <Switch id={`flag-${flag.key}`} checked={enabled} onCheckedChange={setEnabled} disabled={save.isPending} />
    </div>
    <div className="max-w-sm space-y-2">
      <Label htmlFor={`scope-${flag.key}`}>Audience</Label>
      <Select value={scope} onValueChange={setScope} disabled={save.isPending}>
        <SelectTrigger id={`scope-${flag.key}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">School-wide</SelectItem>
          <SelectItem value="staff_only">Staff only</SelectItem>
          <SelectItem value="pilot_only">Selected users or classes</SelectItem>
        </SelectContent>
      </Select>
    </div>
    {scope === "pilot_only" && <div className="grid min-w-0 gap-5 sm:grid-cols-2">
      <Targets title="Pilot users" options={users} selected={userIds} onChange={setUserIds} disabled={save.isPending} />
      <Targets title="Pilot classes" options={classes} selected={classIds} onChange={setClassIds} disabled={save.isPending} />
    </div>}
    <div className="flex flex-wrap items-center gap-4">
      <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save switch"}</Button>
      <p className="text-xs text-muted-foreground">Last saved {new Date(flag.updated_at).toLocaleString()}</p>
    </div>
  </div>;
}

function Targets({ title, options, selected, onChange, disabled }: { title: string; options: Option[]; selected: string[]; onChange: (ids: string[]) => void; disabled: boolean }) {
  const [search, setSearch] = useState("");
  const visible = options.filter((option) => option.label.toLowerCase().includes(search.toLowerCase()));
  return <fieldset className="min-w-0 space-y-2" disabled={disabled}>
    <legend className="text-sm font-medium">{title} · {selected.length} selected</legend>
    <Input aria-label={`Search ${title.toLowerCase()}`} placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
    <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
      {visible.map((option) => <label key={option.id} className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
        <Checkbox checked={selected.includes(option.id)} disabled={disabled} onCheckedChange={(checked) => onChange(checked === true ? [...selected, option.id] : selected.filter((id) => id !== option.id))} />
        <span className="min-w-0 break-words">{option.label}</span>
      </label>)}
      {visible.length === 0 && <p className="p-2 text-sm text-muted-foreground">No matches.</p>}
    </div>
  </fieldset>;
}