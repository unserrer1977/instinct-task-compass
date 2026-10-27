import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { taskUpdatesQuery, useTasks } from "@/hooks/use-tasks";
import { Icon } from "@/components/app-shell";
import { EventTime, ProgressBar, SourceBadge, StatusChip } from "@/components/task-bits";
import { categoryIcon, formatDateTime, formatTaskTimestamp, isOpen, statusMeta, TASK_STATUSES, wasImportedLater, type Task } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { TaskAttachments } from "@/components/task-attachments";
import { PlatformBadges } from "@/components/platform-badges";
import { TaskCardActions } from "@/components/task-actions";

export const Route = createFileRoute("/_authenticated/tasks/$id")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Task Inspector — Instinct Hub" },
      { name: "description", content: "Full detail, progress history and results for a delegated task." },
      { property: "og:title", content: "Task Inspector — Instinct Hub" },
      { property: "og:description", content: "Full detail, progress history and results for a delegated task." },
    ],
  }),
  component: TaskInspector,
});

const KIND_ICON: Record<string, string> = { created: "add_task", status: "swap_horiz", completed: "check", note: "edit_note", progress: "trending_up" };

function TaskInspector() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: tasks, isLoading } = useTasks();
  const task = tasks?.find((t) => t.id === id);
  const { data: updates = [] } = useQuery(taskUpdatesQuery(id));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (isLoading) return <div className="mt-4 h-60 animate-pulse rounded-xl bg-surface-mid" />;
  if (!task)
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">This task doesn't exist or was deleted.</p>
        <Link to="/tasks" className="mt-3 inline-block font-semibold text-primary">Back to Tasks</Link>
      </div>
    );

  async function patch(p: Partial<Task>, message?: string) {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("tasks").update(p).eq("id", id);
    if (!error && message && u.user) {
      await supabase.from("task_updates").insert({ task_id: id, user_id: u.user.id, message, kind: p.status ? (p.status === "completed" ? "completed" : "status") : "note", status: p.status ?? null, source: "dashboard" });
    }
    setBusy(false);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["task_updates"] });
  }

  async function addNote() {
    if (!note.trim() || !task) return;
    await patch({ notes: task.notes ? `${task.notes}\n\n${note.trim()}` : note.trim() }, note.trim());
    setNote("");
    toast.success("Note added — Instinct will see it next time it reads this task");
  }

  async function remove() {
    if (!confirm("Delete this task and its history permanently?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["tasks"] });
    navigate({ to: "/tasks" });
  }

  const m = statusMeta(task.status);
  const panel = "rounded-lg border border-border bg-card p-3";

  return (
    <div className="flex flex-col gap-3 py-1">
      <div className="flex items-center justify-between gap-2">
        <Link to="/today" className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-primary">
          <Icon name="arrow_back" className="text-[16px]" /> Back to Control Centre
        </Link>
        <span className="cc-label text-muted-foreground">Task inspector</span>
      </div>

      <header className={panel}>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip status={task.status} />
          <SourceBadge source={task.source} />
          <PlatformBadges task={task} />
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <Icon name={categoryIcon(task.category)} className="text-[14px]" /> {task.category}
          </span>
          {(task.priority === "high" || task.priority === "urgent") && (
            <span className="rounded-full bg-destructive-soft/70 px-1.5 py-0.5 text-[10px] font-semibold capitalize text-on-destructive-soft">{task.priority}</span>
          )}
        </div>
        <h1 className="cc-heading mt-2 text-[20px] leading-tight break-words [overflow-wrap:anywhere] md:text-[24px]">{task.title}</h1>
        {task.description && <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-muted-foreground">{task.description}</p>}
        {isOpen(task) && (
          <div className="mt-3 flex flex-col gap-1">
            <div className="flex justify-between text-[12px]">
              <span className="text-muted-foreground">{task.current_step ?? m.label}</span>
              <span className="font-mono text-primary">{task.progress}%</span>
            </div>
            <ProgressBar value={task.progress} />
          </div>
        )}
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-3">
          {task.result && (
            <section className={panel}>
              <h2 className="cc-label flex items-center gap-1 text-success"><Icon name="recommend" className="text-[15px]" /> Result</h2>
              <p className="mt-1.5 whitespace-pre-wrap text-[13px]">{task.result}</p>
            </section>
          )}
          {task.notes && (
            <section className={panel}>
              <h2 className="cc-label flex items-center gap-1 text-primary"><Icon name="sticky_note_2" className="text-[15px]" /> Notes</h2>
              <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-muted-foreground">{task.notes}</p>
            </section>
          )}
          <TaskAttachments taskId={task.id} />
          <section className={panel}>
            <div className="flex items-center justify-between">
              <h2 className="cc-label flex items-center gap-1 text-primary"><Icon name="history_edu" className="text-[15px]" /> Activity</h2>
              <span className="font-mono text-[11px] text-muted-foreground">{updates.length} events</span>
            </div>
            <ol className="mt-2 flex flex-col divide-y divide-border">
              {updates.length === 0 && <li className="py-2 text-[13px] text-muted-foreground">No progress updates yet.</li>}
              {updates.map((u) => (
                <li key={u.id} className="flex gap-2.5 py-2">
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", u.kind === "completed" ? "bg-success-soft/50 text-success" : "bg-primary-soft/60 text-primary")}>
                    <Icon name={KIND_ICON[u.kind] ?? "bolt"} className="text-[14px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-2">
                      <span className="text-[11px] font-semibold text-muted-foreground">{u.source === "instinct" ? "Instinct" : "You"}{u.progress != null ? ` · ${u.progress}%` : ""}</span>
                      <EventTime u={u} />
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px]">{u.message}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-2 flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} placeholder="Add a note or instruction for Instinct…" className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-[13px] outline-none focus:ring-2 focus:ring-ring" />
              <button onClick={addNote} disabled={busy || !note.trim()} className="h-9 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-50">Add</button>
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-3">
          <section className={panel}>
            <h2 className="cc-label mb-2 text-muted-foreground">Actions</h2>
            <div className="flex flex-col gap-2">
              {task.status === "needs_review" && (
                <button disabled={busy} onClick={() => patch({ status: "in_progress" }, "Approved — continue")} className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-warning/20 text-[13px] font-semibold text-warning">
                  <Icon name="lock_clock" className="text-[16px]" /> Approve & continue
                </button>
              )}
              <TaskCardActions task={task} compact />
              <select
                value={task.status}
                disabled={busy}
                onChange={(e) => patch({ status: e.target.value }, `Status changed to ${statusMeta(e.target.value).label}`)}
                className="h-9 rounded-md border border-border bg-background px-2 text-[13px] font-semibold outline-none"
                aria-label="Change status"
              >
                {TASK_STATUSES.map((s) => <option key={s} value={s}>{statusMeta(s).label}</option>)}
              </select>
              {isOpen(task) ? (
                <button disabled={busy} onClick={() => patch({ status: "cancelled" }, "Cancelled from dashboard")} className="flex h-9 items-center justify-center gap-1 rounded-md border border-border text-[12px] font-semibold text-muted-foreground">
                  <Icon name="cancel" className="text-[16px]" /> Cancel task
                </button>
              ) : (
                <button onClick={remove} className="flex h-9 items-center justify-center gap-1 rounded-md border border-border text-[12px] font-semibold text-destructive">
                  <Icon name="delete" className="text-[16px]" /> Delete
                </button>
              )}
            </div>
          </section>
          <section className={panel}>
            <h2 className="cc-label mb-1 text-muted-foreground">Dates</h2>
            <dl className="divide-y divide-border">
              <Meta label="Created" value={task.initiated_at ? formatTaskTimestamp(task.initiated_at) : "Original date unknown"} />
              <Meta label="Work started" value={task.started_at ? formatTaskTimestamp(task.started_at) : "—"} />
              <Meta label="Last activity" value={task.last_activity_at ? formatTaskTimestamp(task.last_activity_at) : "Unknown"} />
              <Meta label="Deadline" value={formatDateTime(task.deadline)} />
              <Meta label="Completed" value={formatTaskTimestamp(task.completed_at)} />
              {wasImportedLater(task) && <Meta label="Imported" value={formatTaskTimestamp(task.created_at)} />}
              <Meta label="Priority" value={task.priority} />
              <Meta label="Autonomy" value={task.autonomy.replace(/_/g, " ")} />
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[12px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-mono capitalize">{value}</dd>
    </div>
  );
}
