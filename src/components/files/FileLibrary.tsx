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
import { formatDate } from "@/lib/school";
import { AUDIENCES, audienceLabel, type Audience } from "@/lib/audience";

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

export function FileLibrary({
  classId,
  studentId,
  emptyLabel = "No files shared yet.",
}: {
  classId?: string;
  studentId?: string;
  emptyLabel?: string;
}) {
  const { user, isStaff } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [audience, setAudience] = useState<Audience>("everyone");
  const [busy, setBusy] = useState(false);

  const scopeKey = ["files", classId ?? "school", studentId ?? "all"];

  const { data: files = [] } = useQuery({
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
      return data;
    },
  });

  const uploaderIds = [...new Set(files.map((f) => f.uploaded_by).filter(Boolean))] as string[];
  const { data: people = [] } = useQuery({
    queryKey: ["file-uploaders", uploaderIds.join(",")],
    enabled: uploaderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", uploaderIds);
      if (error) throw error;
      return data;
    },
  });
  const nameFor = (id: string | null) => {
    const p = people.find((x) => x.id === id);
    return p?.full_name || p?.email || "School member";
  };

  async function uploadFiles(list: FileList) {
    if (!user) return;
    setBusy(true);
    let ok = 0;
    for (const file of Array.from(list).slice(0, 20)) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is larger than 50 MB`);
        continue;
      }
      const path = `${classId ?? "school"}/${user.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (upErr) {
        toast.error(`${file.name}: ${upErr.message}`);
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
        class_id: classId ?? null,
        student_id: studentId ?? null,
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        toast.error(`${file.name}: ${error.message}`);
        continue;
      }
      ok += 1;
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (ok > 0) {
      toast.success(`${ok} file${ok === 1 ? "" : "s"} uploaded`);
      queryClient.invalidateQueries({ queryKey: scopeKey });
    }
  }

  const remove = useMutation({
    mutationFn: async (file: { id: string; storage_path: string }) => {
      const { error } = await supabase.from("file_uploads").delete().eq("id", file.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([file.storage_path]);
    },
    onSuccess: () => {
      toast.success("File removed");
      queryClient.invalidateQueries({ queryKey: scopeKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function open(path: string) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data) {
      toast.error(error?.message ?? "Could not open file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <Label htmlFor="file-input" className="text-sm font-medium">
          Share files
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Excel, CSV, PDF, Word, PowerPoint, images, audio and video up to 50 MB each.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Input
            id="file-input"
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            disabled={busy}
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
            className="max-w-sm"
          />
          {isStaff && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Visible to</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
                <SelectTrigger className="w-56">
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
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Upload className="size-3.5" /> {busy ? "Uploading…" : "Choose files to upload"}
          </span>
        </div>
      </div>

      {files.length === 0 ? (
        <p className="panel p-6 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="panel divide-y divide-border">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.title}</p>
                <p className="text-xs text-muted-foreground">
                  {humanSize(Number(f.size_bytes))} · {nameFor(f.uploaded_by)} ·{" "}
                  {formatDate(f.created_at)}
                </p>
              </div>
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
                  description="The file is permanently removed for everyone it was shared with. This cannot be undone."
                  disabled={remove.isPending}
                  onConfirm={() => remove.mutate({ id: f.id, storage_path: f.storage_path })}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
