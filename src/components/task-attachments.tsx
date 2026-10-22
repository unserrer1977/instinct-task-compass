import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Icon } from "@/components/app-shell";
import { formatTaskTimestamp } from "@/lib/tasks";

const BUCKET = "task-attachments";
const MAX = 20 * 1024 * 1024;

type Att = { id: string; file_name: string; mime_type: string; size_bytes: number; storage_path: string; description: string | null; source: string; occurred_at: string | null; created_at: string };

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function typeLabel(a: Att) {
  const ext = a.file_name.includes(".") ? a.file_name.split(".").pop()!.toUpperCase() : "";
  return ext || a.mime_type.split("/")[1]?.toUpperCase() || "FILE";
}

function iconFor(mime: string) {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "picture_as_pdf";
  if (mime.startsWith("video/")) return "movie";
  if (mime.startsWith("audio/")) return "audio_file";
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return "table_chart";
  return "description";
}

const previewable = (m: string) => m.startsWith("image/") || m === "application/pdf" || m.startsWith("text/") || m.startsWith("video/") || m.startsWith("audio/");

async function sha256Hex(buf: ArrayBuffer) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function TaskAttachments({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ att: Att; url: string } | null>(null);
  const { data: items = [] } = useQuery({
    queryKey: ["task_attachments", taskId],
    queryFn: async () => {
      const { data, error } = await supabase.from("task_attachments").select("*").eq("task_id", taskId).order("created_at");
      if (error) throw error;
      return data as Att[];
    },
  });

  async function signed(a: Att, download: boolean) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path, 600, download ? { download: a.file_name } : undefined);
    if (error || !data) { toast.error("Couldn't open this file"); return null; }
    return data.signedUrl;
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    for (const f of Array.from(files)) {
      if (f.size > MAX) { toast.error(`${f.name} is over 20 MB`); continue; }
      const buf = await f.arrayBuffer();
      const hash = await sha256Hex(buf);
      if (items.some((i) => (i as Att & { sha256?: string }).sha256 === hash)) { toast.info(`${f.name} is already attached`); continue; }
      const path = `${u.user!.id}/${taskId}/${crypto.randomUUID()}-${f.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120)}`;
      const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined });
      if (up.error) { toast.error(up.error.message); continue; }
      const { error } = await supabase.from("task_attachments").insert({ task_id: taskId, user_id: u.user!.id, file_name: f.name, mime_type: f.type || "application/octet-stream", size_bytes: f.size, storage_path: path, sha256: hash, source: "dashboard" });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        toast.error(error.code === "23505" ? `${f.name} is already attached` : error.message);
      } else toast.success(`${f.name} attached`);
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    qc.invalidateQueries({ queryKey: ["task_attachments", taskId] });
  }

  async function remove(a: Att) {
    if (!confirm(`Remove ${a.file_name}?`)) return;
    await supabase.storage.from(BUCKET).remove([a.storage_path]);
    const { error } = await supabase.from("task_attachments").delete().eq("id", a.id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["task_attachments", taskId] });
  }

  return (
    <section className="card-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[14px] font-semibold"><Icon name="attach_file" className="text-[18px] text-primary" /> Attachments</h2>
        <button onClick={() => input.current?.click()} disabled={busy} className="inline-flex h-8 items-center gap-1 rounded-lg bg-surface-high px-2.5 text-[12px] font-semibold disabled:opacity-50">
          <Icon name={busy ? "progress_activity" : "upload"} className="text-[16px]" /> {busy ? "Uploading…" : "Add file"}
        </button>
        <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} aria-label="Attach files" />
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">No attachments yet. Files Instinct uploads for this task will appear here.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((a) => (
            <li key={a.id} className="flex items-start gap-3 rounded-lg bg-surface-low p-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon name={iconFor(a.mime_type)} className="text-[18px]" /></span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[13px] font-semibold">{a.file_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {typeLabel(a)} · {formatBytes(a.size_bytes)} · {a.source === "instinct" ? "Instinct" : "You"} · {formatTaskTimestamp(a.occurred_at ?? a.created_at)}
                </p>
                {a.description && <p className="mt-0.5 break-words text-[12px] text-muted-foreground">{a.description}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {previewable(a.mime_type) && (
                  <button aria-label={`Preview ${a.file_name}`} onClick={async () => { const url = await signed(a, false); if (url) setPreview({ att: a, url }); }} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-high"><Icon name="visibility" className="text-[18px]" /></button>
                )}
                <button aria-label={`Download ${a.file_name}`} onClick={async () => { const url = await signed(a, true); if (url) window.location.assign(url); }} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-high"><Icon name="download" className="text-[18px]" /></button>
                <button aria-label={`Remove ${a.file_name}`} onClick={() => remove(a)} className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-surface-high"><Icon name="delete" className="text-[18px]" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {preview && (
        <div role="dialog" aria-label={`Preview of ${preview.att.file_name}`} className="fixed inset-0 z-50 flex flex-col bg-foreground/80 p-3 sm:p-8" onClick={() => setPreview(null)}>
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-2 pb-2 text-background">
            <p className="min-w-0 break-words text-[14px] font-semibold">{preview.att.file_name}</p>
            <button aria-label="Close preview" className="shrink-0"><Icon name="close" /></button>
          </div>
          <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 items-center justify-center overflow-hidden rounded-lg bg-card" onClick={(e) => e.stopPropagation()}>
            {preview.att.mime_type.startsWith("image/") ? (
              <img src={preview.url} alt={preview.att.file_name} className="max-h-full max-w-full object-contain" />
            ) : preview.att.mime_type.startsWith("video/") ? (
              <video src={preview.url} controls className="max-h-full max-w-full" />
            ) : preview.att.mime_type.startsWith("audio/") ? (
              <audio src={preview.url} controls />
            ) : (
              <iframe src={preview.url} title={preview.att.file_name} className="h-full w-full" />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
