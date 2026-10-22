import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCurrentUser, useTasks } from "@/hooks/use-tasks";
import { Icon } from "@/components/app-shell";
import { EmptyState, ProgressBar, SectionTitle, SourceBadge, StatusChip } from "@/components/task-bits";
import { categoryIcon, relativeTime } from "@/lib/tasks";
import { useMcpCredential } from "@/hooks/use-mcp-credential";
import { connectionState } from "@/lib/mcp-token";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({
    meta: [
      { title: "Today — Instinct Hub" },
      { name: "description", content: "What Instinct is working on right now and what needs your sign-off." },
      { property: "og:title", content: "Today — Instinct Hub" },
      { property: "og:description", content: "What Instinct is working on right now and what needs your sign-off." },
    ],
  }),
  component: Today,
});

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Today() {
  const { data: tasks = [], isLoading } = useTasks();
  const { data: user } = useCurrentUser();
  const { data: cred } = useMcpCredential();
  const [clock, setClock] = useState("");
  useEffect(() => {
    const t = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    t();
    const i = setInterval(t, 30000);
    return () => clearInterval(i);
  }, []);

  const name = (user?.user_metadata?.["full_name"] as string | undefined)?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "";
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const review = tasks.filter((t) => t.status === "needs_review");
  const waiting = tasks.filter((t) => t.status === "queued" || t.status === "scheduled");
  const doneToday = tasks.filter((t) => t.status === "completed" && t.completed_at && new Date(t.completed_at) >= startOfDay);
  const active = inProgress.length + review.length + waiting.length;
  const conn = connectionState(cred);

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="relative overflow-hidden card-surface p-4">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary-soft/40 blur-2xl" />
        <div className="pointer-events-none absolute -left-6 -bottom-6 h-24 w-24 rounded-full bg-success-glow/20 blur-xl" />
        <div className="relative flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <Link to="/settings" className="flex items-center gap-1.5">
              <span className="label-caps text-primary">{conn === "connected" ? "Autonomous Sync" : "Instinct Link"}</span>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${conn === "connected" ? "bg-primary animate-pulse" : "bg-outline bg-muted-foreground"}`} />
              {conn !== "connected" && <span className="text-[11px] text-muted-foreground">{conn === "not_configured" ? "not set up" : conn === "awaiting" ? "awaiting first call" : "idle"}</span>}
            </Link>
            <span className="font-mono text-[12px] text-muted-foreground">{clock}</span>
          </div>
          <h1 className="text-[22px] leading-7 font-semibold tracking-tight">
            {greeting()}{name ? `, ${name}` : ""}
          </h1>
          <div className="mt-1 flex items-start gap-2.5 rounded-lg bg-surface-low p-2.5">
            <span className="flex shrink-0 items-center justify-center rounded-full bg-primary/10 p-1 text-primary">
              <Icon name="psychology" className="text-[18px]" />
            </span>
            <div className="flex flex-col">
              <p className="text-sm leading-snug">
                Monitoring <span className="font-bold text-primary">{active} active task{active === 1 ? "" : "s"}</span>
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${review.length ? "bg-destructive" : "bg-success"}`} />
                {review.length ? `${review.length} require${review.length === 1 ? "s" : ""} your sign-off before proceeding` : "Nothing needs your sign-off"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
        <Chip to="in_progress" className="bg-info-soft/50 text-on-info-soft">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info-glow opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-info" />
          </span>
          {inProgress.length} In Progress
        </Chip>
        <Chip to="needs_review" className="bg-destructive-soft/60 text-on-destructive-soft">
          <Icon name="priority_high" className="text-[15px]" /> {review.length} Needs Review
        </Chip>
        <Chip to="completed" className="bg-success-soft/40 text-on-success-soft">
          <Icon name="check_circle" className="text-[15px]" /> {doneToday.length} Done Today
        </Chip>
        <Chip to="queued" className="bg-surface-high text-muted-foreground">
          <Icon name="schedule" className="text-[15px]" /> {waiting.length} Waiting
        </Chip>
      </div>

      <section className="flex flex-col gap-2">
        <SectionTitle
          icon="assignment_late"
          title="Needs Your Review"
          right={review.length > 0 && <span className="rounded-full bg-destructive-soft px-2 py-0.5 text-[11px] font-semibold text-on-destructive-soft">{review.length} pending</span>}
        />
        {review.length === 0 ? (
          <p className="rounded-lg bg-card/70 px-3 py-3 text-[13px] text-muted-foreground">All clear — Instinct isn't waiting on you.</p>
        ) : (
          review.map((t) => (
            <div key={t.id} className="card-surface border-l-4 border-destructive p-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                  <Icon name={categoryIcon(t.category)} className="text-[14px]" /> {t.category}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{relativeTime(t.updated_at)}</span>
              </div>
              <h3 className="mt-1.5 text-[15px] font-semibold tracking-tight">{t.title}</h3>
              {(t.current_step || t.description) && <p className="mt-1 line-clamp-3 text-[13px] text-muted-foreground">{t.current_step ?? t.description}</p>}
              <Link to="/tasks/$id" params={{ id: t.id }} className="mt-3 inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground">
                Review <Icon name="arrow_forward" className="text-[16px]" />
              </Link>
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle
          icon="dynamic_feed"
          title="Live Activity Stream"
          right={
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Real-time
            </span>
          }
        />
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-surface-mid" />
        ) : inProgress.length + waiting.length === 0 ? (
          <EmptyState
            icon="auto_awesome"
            title="Nothing running"
            body="Ask Instinct to do something, or delegate a task here — it will show up live."
            action={<Link to="/delegate" className="mt-2 rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground">Delegate a task</Link>}
          />
        ) : (
          <div className="card-surface divide-y divide-border">
            {[...inProgress, ...waiting].slice(0, 8).map((t) => (
              <Link key={t.id} to="/tasks/$id" params={{ id: t.id }} className="flex items-start gap-3 p-3.5 hover:bg-surface-low/60 transition-colors">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-low text-primary">
                  <Icon name={categoryIcon(t.category)} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-muted-foreground">{t.category}</span>
                    {t.status === "in_progress" ? <span className="font-mono text-[12px] font-medium text-primary">{t.progress}%</span> : <StatusChip status={t.status} />}
                  </div>
                  <p className="truncate text-[14px] font-medium">{t.title}</p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-muted-foreground">
                    {t.status === "in_progress" && <Icon name="sync" className="text-[14px] animate-spin [animation-duration:3s]" />}
                    {t.current_step ?? (t.status === "in_progress" ? "Working…" : "Waiting to start")}
                  </p>
                  {t.status === "in_progress" && <div className="mt-2"><ProgressBar value={t.progress} /></div>}
                </div>
                <SourceBadge source={t.source} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Chip({ to, className, children }: { to: string; className: string; children: React.ReactNode }) {
  return (
    <Link
      to="/tasks"
      search={{ status: to }}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold shadow-sm active:scale-95 transition-transform ${className}`}
    >
      {children}
    </Link>
  );
}
