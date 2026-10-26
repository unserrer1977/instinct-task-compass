import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTasks } from "@/hooks/use-tasks";
import { Icon } from "@/components/app-shell";
import { EmptyState } from "@/components/task-bits";
import { TaskSelectionBar, useTaskActions } from "@/components/task-actions";
import { categoryIcon, type Task } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Today — Instinct Hub" },
      { name: "description", content: "What Instinct is working on right now and what needs your sign-off." },
      { property: "og:title", content: "Today — Instinct Hub" },
      { property: "og:description", content: "What Instinct is working on right now and what needs your sign-off." },
    ],
  }),
  component: Today,
});

const TONES = ["primary", "success", "info"] as const;
const TONE_CLS = {
  primary: { bar: "bg-primary", text: "text-primary", icon: "bg-primary-soft/60 text-primary" },
  success: { bar: "bg-success", text: "text-success", icon: "bg-success-soft/40 text-success" },
  info: { bar: "bg-info", text: "text-info", icon: "bg-info-soft/50 text-info" },
};

function Today() {
  const { data: tasks = [], isLoading } = useTasks();
  const navigate = useNavigate();
  const [cmd, setCmd] = useState("");
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const review = tasks.filter((t) => t.status === "needs_review");
  const active = tasks.filter((t) => t.status === "in_progress" || t.status === "queued" || t.status === "scheduled");
  const doneToday = tasks.filter((t) => t.status === "completed" && t.completed_at && new Date(t.completed_at) >= startOfDay);
  const stream = [...active, ...doneToday].slice(0, 8);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = cmd.trim();
    void navigate({ to: "/delegate", search: v ? { prompt: v } : {} });
  };

  return (
    <div className="flex flex-col gap-6 py-3 pb-24">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
        <Pill to="needs_review" dot="bg-warning" cls="bg-warning-soft text-on-warning-soft">{review.length} Pending Sign-off</Pill>
        <Pill to="in_progress" dot="bg-primary" cls="bg-primary-soft/60 text-primary">{active.length} Active Automations</Pill>
        <Pill to="completed" dot="bg-success" cls="bg-success-soft/40 text-on-success-soft">{doneToday.length} Completed Today</Pill>
      </div>

      <TaskSelectionBar tasks={review} />

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[20px] font-medium tracking-tight">Needs Attention</h2>
          <span className="text-[13px] font-semibold text-muted-foreground">{review.length} item{review.length === 1 ? "" : "s"}</span>
        </div>
        {review.length === 0 ? (
          <p className="rounded-xl bg-card/70 px-4 py-4 text-[13px] text-muted-foreground">All clear — Instinct isn't waiting on you.</p>
        ) : (
          review.map((t) => <AttentionCard key={t.id} task={t} />)
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[20px] font-medium tracking-tight">Live Automation Stream</h2>
          <Link to="/tasks" className="text-[13px] font-semibold text-primary">View all</Link>
        </div>
        {isLoading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-surface-mid" />
        ) : stream.length === 0 ? (
          <EmptyState icon="auto_awesome" title="Nothing running" body="Ask Instinct to do something, or delegate a task below — it will show up live." />
        ) : (
          <div className="rounded-2xl bg-card p-2 shadow-sm">
            {stream.map((t, i) => {
              const done = t.status === "completed";
              const tone = TONE_CLS[done ? "success" : TONES[i % 3] ?? "primary"];
              const pct = done ? 100 : Math.max(0, Math.min(100, t.progress ?? 0));
              return (
                <Link key={t.id} to="/tasks/$id" params={{ id: t.id }} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-surface-low", i > 0 && "border-t border-border")}>
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", done ? "bg-primary-soft/60 text-primary" : tone.icon)}>
                    <Icon name={done ? "check_circle" : categoryIcon(t.category)} className="text-[20px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <span className={cn("text-[15px] break-words [overflow-wrap:anywhere]", done && "text-muted-foreground")}>{t.title}</span>
                      <span className={cn("shrink-0 font-mono text-[12px]", tone.text)}>{done ? "Done" : `${pct}%`}</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-high">
                      <div className={cn("h-full rounded-full transition-all", tone.bar)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <form onSubmit={submit} className="fixed inset-x-0 bottom-24 z-40 mx-auto w-full max-w-3xl px-4">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-2 pl-4 shadow-lg">
          <Icon name="auto_awesome" className="text-primary" />
          <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="Delegate a task or ask Instinct…" className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
          <Link to="/assistant" aria-label="Ask Instinct" className="p-2 text-muted-foreground hover:text-foreground"><Icon name="forum" /></Link>
          <button type="submit" aria-label="Delegate" className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Icon name="arrow_upward" />
          </button>
        </div>
      </form>
    </div>
  );
}

function AttentionCard({ task: t }: { task: Task }) {
  const { busy, change } = useTaskActions();
  return (
    <div className="relative overflow-hidden rounded-2xl bg-card p-4 pl-5 shadow-sm">
      <span className="absolute inset-y-0 left-0 w-1 bg-warning" />
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-on-warning-soft">
          <Icon name={categoryIcon(t.category)} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-medium break-words [overflow-wrap:anywhere]">{t.title}</p>
            <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] font-semibold text-on-warning-soft">Review</span>
          </div>
          {(t.current_step || t.description) && <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{t.current_step ?? t.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button disabled={busy} onClick={() => void change([t.id], "completed")} className="rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-60">
            Approve
          </button>
          <Link to="/tasks/$id" params={{ id: t.id }} aria-label={`View ${t.title}`} className="p-2 text-muted-foreground hover:text-foreground">
            <Icon name="visibility" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Pill({ to, dot, cls, children }: { to: string; dot: string; cls: string; children: React.ReactNode }) {
  return (
    <Link to="/tasks" search={{ status: to }} className={cn("flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold", cls)}>
      <span className={cn("h-2 w-2 rounded-full", dot)} />
      {children}
    </Link>
  );
}
