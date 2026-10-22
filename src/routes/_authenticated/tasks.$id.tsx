import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { taskUpdatesQuery, useTasks } from "@/hooks/use-tasks";
import { Icon } from "@/components/app-shell";
import { ProgressBar, SourceBadge, StatusChip } from "@/components/task-bits";
import { categoryIcon, formatDateTime, isOpen, statusMeta, TASK_STATUSES, type Task } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tasks/$id")({
  head: () => ({
    meta: [
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
    if (!note.trim()) return;
    await patch({ notes: task!.notes ? `${task!.notes}\n\n${note.trim()}` : note.trim() }, note.trim());
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

  return (
    <div className="flex flex-col gap-4 py-3">
      <Link to="/tasks" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground">
        <Icon name="arrow_back" className="text-[18px]" /> Back to Tasks
      </Link>

      <div className="card-surface relative overflow-hidden p-4">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary-soft/40 blur-2xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={task.status} />
            {task.status === "in_progress" && <span className="font-mono text-[12px] text-muted-foreground">{task.progress}% complete</span>}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
            <Icon name={categoryIcon(task.category)} className="text-[15px]" /> {task.category}
            <span className="text-border">•</span>
            <SourceBadge source={task.source} />
          </div>
          <h1 className="mt-2 text-[22px] font-semibold leading-7 tracking-tight">{task.title}</h1>
          {task.description && <p className="mt-2 whitespace-pre-wrap text-[14px] text-muted-foreground">{task.description}</p>}
          {isOpen(task) && (
            <div className="mt-4 flex flex-col gap-1.5">
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground">{task.current_step ?? m.label}</span>
                <span className="font-mono text-primary">{task.progress}%</span>
              </div>
              <ProgressBar value={task.progress} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Meta icon="schedule" label="Requested" value={formatDateTime(task.created_at)} />
        <Meta icon="update" label="Last update" value={formatDateTime(task.updated_at)} />
        <Meta icon="event" label="Deadline" value={formatDateTime(task.deadline)} />
        <Meta icon="task_alt" label="Completed" value={formatDateTime(task.completed_at)} />
        <Meta icon="flag" label="Priority" value={task.priority} />
        <Meta icon="verified_user" label="Autonomy" value={task.autonomy.replace(/_/g, " ")} />
      </div>

      {task.result && (
        <section className="card-surface p-4">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold"><Icon name="recommend" className="text-[18px] text-success" /> Result</h2>
          <p className="mt-2 whitespace-pre-wrap text-[14px]">{task.result}</p>
        </section>
      )}

      {task.notes && (
        <section className="card-surface p-4">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold"><Icon name="sticky_note_2" className="text-[18px] text-primary" /> Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-[14px] text-muted-foreground">{task.notes}</p>
        </section>
      )}

      <section className="card-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold"><Icon name="history_edu" className="text-[18px] text-primary" /> Execution Audit Log</h2>
          <span className="font-mono text-[11px] text-muted-foreground">{updates.length} events logged</span>
        </div>
        <ol className="mt-3 flex flex-col">
          {updates.length === 0 && <li className="text-[13px] text-muted-foreground">No progress updates yet.</li>}
          {updates.map((u, i) => (
            <li key={u.id} className="relative flex gap-3 pb-4 last:pb-0">
              {i < updates.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-border" />}
              <span className={cn("z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", u.kind === "completed" ? "bg-success text-primary-foreground" : "bg-primary-soft text-primary")}>
                <Icon name={KIND_ICON[u.kind] ?? "bolt"} className="text-[15px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">{u.source === "instinct" ? "Instinct" : "You"}{u.progress != null ? ` · ${u.progress}%` : ""}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{formatDateTime(u.created_at)}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px]">{u.message}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} placeholder="Add a note or instruction for Instinct…" className="h-10 flex-1 rounded-lg bg-surface-low px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <button onClick={addNote} disabled={busy || !note.trim()} className="h-10 rounded-lg bg-surface-high px-3 text-[13px] font-semibold disabled:opacity-50">Add</button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        {task.status === "needs_review" && (
          <button disabled={busy} onClick={() => patch({ status: "in_progress" }, "Approved — continue")} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground shadow-md shadow-primary/25">
            <Icon name="lock_clock" /> Approve & let Instinct continue
          </button>
        )}
        {isOpen(task) && (
          <button disabled={busy} onClick={() => patch({ status: "completed" }, "Marked complete from dashboard")} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-success-soft/50 font-semibold text-on-success-soft">
            <Icon name="check_circle" /> Mark complete
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex h-11 items-center gap-1 rounded-xl bg-card px-3 shadow-sm">
            <Icon name="edit_note" className="text-muted-foreground" />
            <select
              value={task.status}
              disabled={busy}
              onChange={(e) => patch({ status: e.target.value }, `Status changed to ${statusMeta(e.target.value).label}`)}
              className="h-full flex-1 bg-transparent text-[13px] font-semibold outline-none"
              aria-label="Change status"
            >
              {TASK_STATUSES.map((s) => <option key={s} value={s}>{statusMeta(s).label}</option>)}
            </select>
          </label>
          {isOpen(task) ? (
            <button disabled={busy} onClick={() => patch({ status: "cancelled" }, "Cancelled from dashboard")} className="flex h-11 items-center justify-center gap-1 rounded-xl bg-card text-[13px] font-semibold text-muted-foreground shadow-sm">
              <Icon name="cancel" /> Cancel
            </button>
          ) : (
            <button onClick={remove} className="flex h-11 items-center justify-center gap-1 rounded-xl bg-card text-[13px] font-semibold text-destructive shadow-sm">
              <Icon name="delete" /> Delete
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Meta({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card p-3 shadow-sm">
      <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><Icon name={icon} className="text-[14px]" />{label}</div>
      <p className="mt-0.5 text-[13px] font-medium capitalize">{value}</p>
    </div>
  );
}
