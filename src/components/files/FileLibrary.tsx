import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, Upload } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { fetchByIds } from "@/lib/query";
import { LoadError } from "@/components/LoadError";
import { NotebookEmpty, NotebookLoading } from "@/components/NotebookDecorations";
import { formatDate } from "@/lib/school";
import { AUDIENCES, audienceLabel, type Audience } from "@/lib/audience";
import { readPrivateFile } from "@/lib/private-file";

const BUCKET = "school-files";
const MAX_BYTES = 50 * 1024 * 1024;

const ACCEPT = [
  ".xlsx",
  ".xls",
  ".csv",
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".txt",
  ".rtf",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".heic",
  ".mp3",
  ".m4a",
  ".wav",
  ".mp4",
  ".mov",
  ".webm",
  ".zip",
].join(",");

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
}

type FileRow = {
  id: string;
  title: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  storage_path: string;
  audience: string;
  created_at: string;
  uploaded_by: string | null;
  class_id: string | null;
};

type ClassOption = { id: string; name: string; grade_level: number | null };

export function FileLibrary({
  classId,
  studentId,
  emptyLabel = "No files shared yet.",
  desktopReview = false,
}: {
  classId?: string;
  studentId?: string;
  emptyLabel?: string;
  desktopReview?: boolean;
}) {
  const { user, isStaff } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [audience, setAudience] = useState<Audience>("everyone");
  const [busy, setBusy] = useState(false);
  const [targetClasses, setTargetClasses] = useState<string[]>(classId ? [classId] : []);

  const scopeKey = ["files", classId ?? "school", studentId ?? "all"];

  const filesQuery = useQuery({
    queryKey: scopeKey,
    queryFn: async () => {
      let q = supabase
        .from("file_uploads")
        .select(
          "id, title, file_name, mime_type, size_bytes, storage_path, audience, created_at, uploaded_by, class_id",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      q = classId ? q.eq("class_id", classId) : q.is("class_id", null);
      if (studentId) q = q.eq("student_id", studentId);
      const { data, error } = await q;
      if (error) throw error;
      return data as FileRow[];
    },
  });
  const files = filesQuery.data ?? [];

  // Classes this staff member can share to — teachers see their own classes,
  // admins see every class.
  const { data: myClasses = [] } = useQuery({
    queryKey: ["file-target-classes", user?.id],
    enabled: !!user && isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, grade_level, teacher_id, teacher_name")
        .order("grade_level")
        .order("name");
      if (error) throw error;
      const all = (data ?? []) as (ClassOption & {
        teacher_id: string | null;
        teacher_name: string | null;
      })[];
      const mine = all.filter((c) => c.teacher_id === user!.id);
      return mine.length > 0 ? mine : all;
    },
  });

  // Colleagues' classes in the same grade as this class.
  const currentGrade = myClasses.find((c) => c.id === classId)?.grade_level ?? null;
  const { data: gradeTargets = [] } = useQuery({
    queryKey: ["file-grade-targets", user?.id, currentGrade],
    enabled: !!user && isStaff && !!classId && currentGrade != null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("grade_file_targets", { _grade: currentGrade! });
      if (error) throw error;
      const mineIds = new Set(myClasses.map((c) => c.id));
      return (data ?? []).filter((c) => !mineIds.has(c.id));
    },
  });

  const uploaderIds = [...new Set(files.map((f) => f.uploaded_by).filter(Boolean))] as string[];
  const { data: people = [] } = useQuery({
    queryKey: ["file-uploaders", uploaderIds.join(",")],
    enabled: uploaderIds.length > 0,
    queryFn: () =>
      fetchByIds(uploaderIds, (ids, from, to) =>
        supabase.from("profiles").select("id, full_name, email").in("id", ids).order("id").range(from, to),
      ),
  });
  const nameFor = (id: string | null) => {
    const p = people.find((x) => x.id === id);
    return p?.full_name || p?.email || "School member";
  };

  // Same file shared to several classes yields one row per class — show it once.
  const grouped = new Map<string, FileRow[]>();
  for (const f of files) {
    const list = grouped.get(f.storage_path) ?? [];
    list.push(f);
    grouped.set(f.storage_path, list);
  }
  const shown = [...grouped.values()].map((rows) => rows[0]!);

  const classNameFor = (id: string | null) =>
    myClasses.find((c) => c.id === id)?.name ??
    gradeTargets.find((c) => c.id === id)?.name ??
    null;

  function toggleTarget(id: string) {
    setTargetClasses((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function uploadFiles(list: FileList) {
    if (!user) return;
    const targets = classId
      ? isStaff && targetClasses.length > 0
        ? targetClasses
        : [classId]
      : [null as string | null];
    if (targets.length === 0) {
      toast.error("Pick at least one class to share with");
      return;
    }
    setBusy(true);
    let ok = 0;
    for (const file of Array.from(list).slice(0, 20)) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is larger than 50 MB`);
        continue;
      }
      // Each class gets its own frozen copy: later edits or deletions of one
      // copy never affect the copies shared with other classes.
      let fileOk = true;
      for (const cid of targets) {
        // Store under the current class folder (which the uploader can access);
        // the row's class_id decides which class sees it.
        const path = `${classId ?? cid ?? "school"}/${user.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (upErr) {
          toast.error(`${file.name}: ${upErr.message}`);
          fileOk = false;
          continue;
        }
        const { error } = await supabase.from("file_uploads").insert({
          title: file.name.slice(0, 160),
          file_name: file.name.slice(0, 160),
          mime_type: file.type || null,
          size_bytes: file.size,
          storage_path: path,
          audience: isStaff ? audience : "everyone",
          uploaded_by: user.id,
          class_id: cid,
          student_id: studentId ?? null,
        });
        if (error) {
          await supabase.storage.from(BUCKET).remove([path]);
          toast.error(`${file.name}: ${error.message}`);
          fileOk = false;
        }
      }
      if (fileOk) ok += 1;
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (ok > 0) {
      toast.success(
        targets.length > 1
          ? `${ok} file${ok === 1 ? "" : "s"} shared with ${targets.length} classes`
          : `${ok} file${ok === 1 ? "" : "s"} uploaded`,
      );
      queryClient.invalidateQueries({ queryKey: ["files"] });
    }
  }

  const remove = useMutation({
    mutationFn: async (file: { id: string; storage_path: string }) => {
      // Delete every row pointing at this upload (one per class it was shared with).
      const { error } = await supabase
        .from("file_uploads")
        .delete()
        .eq("storage_path", file.storage_path);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([file.storage_path]);
    },
    onSuccess: () => {
      toast.success("File removed");
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function open(path: string) {
    try {
      const data = await readPrivateFile(() => supabase.storage.from(BUCKET).download(path));
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = path.split("/").pop() ?? "file";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open file");
    }
  }

  return (
    <div className={desktopReview ? "min-w-0 space-y-6" : "space-y-4"}>
      <div className={desktopReview ? "min-w-0 border-b border-border pb-6" : "panel p-4"}>
        {desktopReview ? (
          <h2 className="text-base font-semibold">Share files</h2>
        ) : (
          <Label htmlFor="file-input" className="text-sm font-medium">Share files</Label>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Excel, CSV, PDF, Word, PowerPoint, images, audio and video up to 50 MB each.
        </p>
        <div className={desktopReview ? "mt-4 grid items-end gap-4 sm:grid-cols-[minmax(0,18rem)_auto] sm:justify-start" : "mt-3 flex flex-wrap items-end gap-3"}>
          <Input
            id="file-input"
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            disabled={busy}
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
            aria-label="Choose files to upload"
            className={desktopReview ? "hidden" : "max-w-sm"}
          />
          {desktopReview && !isStaff && (
            <Button disabled={busy} onClick={() => inputRef.current?.click()}>
              <Upload aria-hidden="true" /> {busy ? "Uploading…" : "Upload files"}
            </Button>
          )}
          {isStaff && (
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={desktopReview ? "review-file-audience" : undefined} className="text-xs text-muted-foreground">Visible to</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
                <SelectTrigger id={desktopReview ? "review-file-audience" : undefined} className={desktopReview ? "w-full" : "w-56"}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {desktopReview ? (
            isStaff && <Button disabled={busy} onClick={() => inputRef.current?.click()}>
              <Upload aria-hidden="true" /> {busy ? "Uploading…" : "Upload files"}
            </Button>
          ) : (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Upload className="size-3.5" /> {busy ? "Uploading…" : "Choose files to upload"}
            </span>
          )}
        </div>

        {isStaff && classId && myClasses.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <Label className="text-xs text-muted-foreground">{gradeTargets.length > 0 ? "My classes" : "Share with classes"}</Label>
            <div className="flex flex-wrap gap-2">
              {myClasses.map((c) => {
                const active = targetClasses.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleTarget(c.id)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {c.name}
                    {c.grade_level ? ` · G${c.grade_level}` : ""}
                  </button>
                );
              })}
            </div>
            {gradeTargets.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs text-muted-foreground">
                    Other Grade {currentGrade} classes
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      const ids = [...myClasses.filter((c) => c.grade_level === currentGrade), ...gradeTargets].map((c) => c.id);
                      const allOn = ids.every((id) => targetClasses.includes(id));
                      setTargetClasses((prev) =>
                        allOn ? prev.filter((id) => !ids.includes(id) || id === classId) : [...new Set([...prev, ...ids])],
                      );
                    }}
                  >
                    All Grade {currentGrade} classes
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {gradeTargets.map((c) => {
                    const active = targetClasses.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleTarget(c.id)}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        {c.name}
                        {c.teacher_name ? ` · ${c.teacher_name}` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              The same file is shared with every selected class — each class sees it in its own
              Files tab.
            </p>
          </div>
        )}
      </div>

      {filesQuery.isError ? (
        <LoadError label="Files couldn't be loaded." onRetry={() => void filesQuery.refetch()} />
      ) : filesQuery.isPending ? (
        <NotebookLoading className="py-6 text-sm text-muted-foreground">Loading files…</NotebookLoading>
      ) : shown.length === 0 ? (
        <NotebookEmpty className={desktopReview ? "py-6 text-sm text-muted-foreground" : "panel p-6 text-sm text-muted-foreground"}>{emptyLabel}</NotebookEmpty>
      ) : (
        <ul aria-label="Shared files" className={desktopReview ? "min-w-0 divide-y divide-border" : "panel divide-y divide-border"}>
          {shown.map((f) => {
            const sharedWith = grouped
              .get(f.storage_path)!
              .map((r) => classNameFor(r.class_id))
              .filter(Boolean) as string[];
            return (
              <li key={f.storage_path} className={desktopReview ? "grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 py-4 xl:grid-cols-[1rem_minmax(0,1fr)_auto]" : "flex flex-wrap items-center gap-3 px-4 py-3"}>
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className={desktopReview ? "text-sm font-medium [overflow-wrap:anywhere]" : "truncate text-sm font-medium"}>{f.title}</p>
                  <p className={desktopReview ? "mt-1 max-w-prose text-xs text-muted-foreground [overflow-wrap:anywhere]" : "text-xs text-muted-foreground"}>
                    {humanSize(Number(f.size_bytes))} · {nameFor(f.uploaded_by)} ·{" "}
                    {formatDate(f.created_at)}
                    {sharedWith.length > 1 ? ` · Also in: ${sharedWith.filter((n) => n !== classNameFor(f.class_id)).join(", ") || sharedWith.join(", ")}` : ""}
                  </p>
                </div>
                {desktopReview && <div className="col-start-2 flex flex-wrap items-center gap-2 xl:col-start-3 xl:row-start-1">
                  {f.audience !== "everyone" && <Badge variant="secondary" className="max-w-full whitespace-normal">{audienceLabel(f.audience)}</Badge>}
                  <Button variant="ghost" size="sm" aria-label={`Open ${f.title}`} title={`Open ${f.title}`} onClick={() => open(f.storage_path)}>
                    <Download aria-hidden="true" /> Open
                  </Button>
                  {(isStaff || f.uploaded_by === user?.id) && <ConfirmDeleteButton
                    label="Delete"
                    title={`Delete “${f.title}”?`}
                    description="The file is permanently removed from every class it was shared with. This cannot be undone."
                    disabled={remove.isPending}
                    onConfirm={() => remove.mutate({ id: f.id, storage_path: f.storage_path })}
                  />}
                </div>}
                {!desktopReview && <>
                {f.audience !== "everyone" && (
                  <Badge variant="secondary">{audienceLabel(f.audience)}</Badge>
                )}
                <Button variant="outline" size="sm" onClick={() => open(f.storage_path)}>
                  <Download className="mr-2 size-4" /> Open
                </Button>
                {(isStaff || f.uploaded_by === user?.id) && (
                  <ConfirmDeleteButton
                    label="Delete"
                    title={`Delete “${f.title}”?`}
                    description="The file is permanently removed from every class it was shared with. This cannot be undone."
                    disabled={remove.isPending}
                    onConfirm={() => remove.mutate({ id: f.id, storage_path: f.storage_path })}
                  />
                )}
                </>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
