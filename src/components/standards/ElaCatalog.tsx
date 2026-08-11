import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { ELA_STANDARDS, strandsForGrade, type ElaStandard } from "@/data/ela-standards";

const SUBJECT = "English Language Arts";

export function ElaCatalog({ isStaff }: { isStaff: boolean }) {
  const queryClient = useQueryClient();
  const [grade, setGrade] = useState(String(ELA_STANDARDS[0].grade));
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const gradeNum = Number(grade);

  const { data: existing = [] } = useQuery({
    queryKey: ["standards-codes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("standards").select("code");
      if (error) throw error;
      return data.map((r) => r.code);
    },
  });
  const inLibrary = useMemo(() => new Set(existing), [existing]);

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return strandsForGrade(gradeNum)
      .map((g) => ({
        ...g,
        standards: term
          ? g.standards.filter(
              (s) =>
                s.code.toLowerCase().includes(term) ||
                s.description.toLowerCase().includes(term),
            )
          : g.standards,
      }))
      .filter((g) => g.standards.length > 0);
  }, [gradeNum, search]);

  const selectedCodes = Object.keys(selected).filter((c) => selected[c]);

  const importSelected = useMutation({
    mutationFn: async () => {
      const all = ELA_STANDARDS.find((g) => g.grade === gradeNum)?.standards ?? [];
      const rows = all
        .filter((s) => selected[s.code] && !inLibrary.has(s.code))
        .map((s) => ({
          code: s.code,
          description: s.description,
          subject: SUBJECT,
          grade_level: gradeNum,
        }));
      if (rows.length === 0) throw new Error("Nothing new to add — those are already in your library");
      const { error } = await supabase.from("standards").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      setSelected({});
      toast.success(`Added ${count} standard${count === 1 ? "" : "s"} to your library`);
      queryClient.invalidateQueries({ queryKey: ["standards"] });
      queryClient.invalidateQueries({ queryKey: ["standards-codes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleGroup = (standards: ElaStandard[], on: boolean) =>
    setSelected((prev) => {
      const next = { ...prev };
      for (const s of standards) {
        if (inLibrary.has(s.code)) continue;
        if (on) next[s.code] = true;
        else delete next[s.code];
      }
      return next;
    });

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Common Core ELA library</h2>
          <p className="text-xs text-muted-foreground">
            Browse by grade and strand, tick the standards you teach, then add them to your school
            standards list so they can be tagged on assessments.
          </p>
        </div>
        {isStaff && (
          <Button
            onClick={() => importSelected.mutate()}
            disabled={selectedCodes.length === 0 || importSelected.isPending}
          >
            Add {selectedCodes.length || ""} selected
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Tabs value={grade} onValueChange={setGrade}>
          <TabsList>
            {ELA_STANDARDS.map((g) => (
              <TabsTrigger key={g.grade} value={String(g.grade)}>
                {g.grade === 9 ? "Grade 9" : `Grade ${g.grade}`}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search codes or wording…"
          className="max-w-64"
        />
      </div>

      <div className="mt-4 space-y-3">
        {groups.map((group) => {
          const isCollapsed = collapsed[`${gradeNum}:${group.strand}`];
          const addable = group.standards.filter((s) => !inLibrary.has(s.code));
          const allOn = addable.length > 0 && addable.every((s) => selected[s.code]);
          return (
            <section key={group.strand} className="rounded-lg border border-border">
              <header className="flex flex-wrap items-center gap-3 bg-secondary/50 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((p) => ({
                      ...p,
                      [`${gradeNum}:${group.strand}`]: !isCollapsed,
                    }))
                  }
                  className="flex items-center gap-2 text-sm font-semibold"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                  />
                  {group.strand}
                </button>
                <Badge variant="outline">{group.standards.length}</Badge>
                {isStaff && addable.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.standards, !allOn)}
                    className="ml-auto text-xs text-accent hover:underline"
                  >
                    {allOn ? "Clear strand" : "Select strand"}
                  </button>
                ) : null}
              </header>
              {!isCollapsed && (
                <ul className="divide-y divide-border">
                  {group.standards.map((s) => {
                    const added = inLibrary.has(s.code);
                    return (
                      <li
                        key={s.code}
                        className={`flex gap-3 px-4 py-2.5 ${s.parent ? "pl-10" : ""}`}
                      >
                        {isStaff && (
                          <Checkbox
                            id={`cc-${s.code}`}
                            className="mt-0.5"
                            checked={added || !!selected[s.code]}
                            disabled={added}
                            onCheckedChange={(v) =>
                              setSelected((p) => {
                                const next = { ...p };
                                if (v) next[s.code] = true;
                                else delete next[s.code];
                                return next;
                              })
                            }
                          />
                        )}
                        <label htmlFor={`cc-${s.code}`} className="flex-1 cursor-pointer text-sm">
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge variant={s.parent ? "secondary" : "outline"}>{s.code}</Badge>
                            {added ? (
                              <span className="text-xs text-success">in library</span>
                            ) : null}
                          </span>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            {s.description}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No standards match that search.</p>
        ) : null}
      </div>
    </div>
  );
}
