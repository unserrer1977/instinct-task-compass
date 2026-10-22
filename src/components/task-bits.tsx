import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/app-shell";
import { eventTime, categoryIcon, formatDateTime, formatTaskTimestamp, relativeTime, statusMeta, wasImportedLater, type Task, type TaskUpdate } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { TaskCardActions, useTaskActions } from "@/components/task-actions";

export function StatusChip({ status, className }: { status: string; className?: string }) {
  const m = statusMeta(status);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", m.chip, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot, status === "in_progress" && "animate-pulse")} />
      {m.label}
    </span>
  );
}

export function SourceBadge({ source }: { source: string }) {
  return source === "instinct" ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft/60 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
      <Icon name="neurology" className="text-[12px]" /> Instinct
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-high px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
      <Icon name="person" className="text-[12px]" /> You
    </span>
  );
}

export function ProgressBar({ value, tone = "primary" }: { value: number; tone?: "primary" | "success" | "info" }) {
  const bar = tone === "success" ? "bg-success" : tone === "info" ? "bg-info" : "bg-primary";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-high">
      <div className={cn("h-full rounded-full transition-all duration-500", bar)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function TaskCard({ task }: { task: Task }) {
  const done = task.status === "completed";
  const { selected } = useTaskActions();
  return (
    <article className={cn("card-surface p-4 transition-shadow", selected.has(task.id) && "ring-2 ring-primary")}>
    <Link
      to="/tasks/$id"
      params={{ id: task.id }}
      className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <Icon name={categoryIcon(task.category)} className="text-[14px]" />
            {task.category}
          </span>
          {(task.priority === "high" || task.priority === "urgent") && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive-soft/70 px-1.5 py-0.5 text-[10px] font-semibold text-on-destructive-soft">
              <Icon name="flag" className="text-[12px]" fill /> {task.priority === "urgent" ? "Urgent" : "High Priority"}
            </span>
          )}
        </div>
        <StatusChip status={task.status} />
      </div>
      <h3 className={cn("mt-2 text-[15px] font-semibold leading-snug tracking-tight break-words [overflow-wrap:anywhere]", done && "text-muted-foreground")}>{task.title}</h3>
      {task.description && <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{task.description}</p>}
      {task.status === "in_progress" && (
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground truncate">{task.current_step ?? "Working…"}</span>
            <span className="font-mono font-medium text-primary">{task.progress}%</span>
          </div>
          <ProgressBar value={task.progress} />
        </div>
      )}
      {done && task.result && (
        <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-success-soft/25 p-2 text-[12px] text-on-success-soft">
          <Icon name="task_alt" className="text-[16px]" /> <span className="line-clamp-2">{task.result}</span>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <SourceBadge source={task.source} />
        <span className="font-mono">
          {done ? `Done ${relativeTime(task.completed_at)}` : task.deadline ? `Due ${formatDateTime(task.deadline)}` : `Active ${relativeTime(task.sort_activity_at)}`}
        </span>
      </div>
      <TaskTimestamps task={task} />
    </Link>
    <TaskCardActions task={task} />
    </article>
  );
}

function Stamp({ label, iso, unknown = "Unknown" }: { label: string; iso: string | null; unknown?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="font-semibold">{label}</dt>
      <dd>{iso ? <time dateTime={iso}>{formatTaskTimestamp(iso)}</time> : <span className="italic">{unknown}</span>}</dd>
    </div>
  );
}

export function TaskTimestamps({ task }: { task: Pick<Task, "initiated_at" | "last_activity_at" | "created_at" | "source"> }) {
  return (
    <dl className="mt-3 grid gap-1 text-[11px] text-muted-foreground">
      <Stamp label="Created" iso={task.initiated_at} unknown="Original date unknown" />
      <Stamp label="Last activity" iso={task.last_activity_at} />
      {wasImportedLater(task) && <Stamp label="Imported" iso={task.created_at} />}
    </dl>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: string; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-input bg-card/60 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-mid text-muted-foreground">
        <Icon name={icon} />
      </span>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="max-w-xs text-[13px] text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

export function SectionTitle({ icon, title, right }: { icon: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <Icon name={icon} className="text-[18px] text-primary" />
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      </div>
      {right}
    </div>
  );
}

/** A history entry's real time; flags entries whose real time is unknown (only the upload time is known). */
export function EventTime({ u }: { u: Pick<TaskUpdate, "occurred_at" | "created_at" | "source"> }) {
  const at = eventTime(u);
  const unknown = !u.occurred_at && u.source === "instinct";
  return (
    <time dateTime={at} className="font-mono text-[11px] text-muted-foreground" title={unknown ? "Actual time unknown — this is when Instinct uploaded it" : `Recorded ${formatTaskTimestamp(u.created_at)}`}>
      {unknown ? `Uploaded ${formatTaskTimestamp(at)}` : formatTaskTimestamp(at)}
    </time>
  );
}
