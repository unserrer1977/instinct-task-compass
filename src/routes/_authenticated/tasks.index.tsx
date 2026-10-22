import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { useTasks } from "@/hooks/use-tasks";
import { Icon } from "@/components/app-shell";
import { EmptyState, ProgressBar, TaskCard } from "@/components/task-bits";
import { CATEGORIES, categoryIcon } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { TaskSelectionBar } from "@/components/task-actions";

const search = z.object({
  status: z.string().optional(),
  category: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/tasks/")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Tasks — Instinct Hub" },
      { name: "description", content: "Every task delegated to Instinct, filterable by status and category." },
      { property: "og:title", content: "Tasks — Instinct Hub" },
      { property: "og:description", content: "Every task delegated to Instinct, filterable by status and category." },
    ],
  }),
  component: TasksPage,
});

type Tab = "active" | "review" | "waiting" | "completed";

function tabFromStatus(s?: string): Tab {
  if (s === "needs_review") return "review";
  if (s === "completed") return "completed";
  if (s === "queued" || s === "scheduled") return "waiting";
  return "active";
}

function TasksPage() {
  const sp = Route.useSearch();
  const navigate = useNavigate({ from: "/tasks/" });
  const { data: tasks = [], isLoading } = useTasks();
  const [q, setQ] = useState("");
  const tab = tabFromStatus(sp.status);
  const category = sp.category ?? "All";

  const inCat = useMemo(() => (category === "All" ? tasks : tasks.filter((t) => t.category === category)), [tasks, category]);
  const searched = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? inCat.filter((t) => `${t.title} ${t.description ?? ""} ${t.notes ?? ""}`.toLowerCase().includes(s)) : inCat;
  }, [inCat, q]);

  const groups: Record<Tab, typeof tasks> = {
    active: searched.filter((t) => t.status === "in_progress"),
    review: searched.filter((t) => t.status === "needs_review"),
    waiting: searched.filter((t) => t.status === "queued" || t.status === "scheduled"),
    completed: searched.filter((t) => t.status === "completed" || t.status === "cancelled"),
  };
  const list = groups[tab];

  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) m.set(t.category, (m.get(t.category) ?? 0) + 1);
    return m;
  }, [tasks]);
  const cats = ["All", ...new Set([...CATEGORIES.map((c) => c.name), ...catCounts.keys()])].filter((c) => c === "All" || catCounts.get(c));

  const hubs = [...catCounts.keys()].slice(0, 3).map((c) => {
    const ts = tasks.filter((t) => t.category === c);
    const open = ts.filter((t) => t.status !== "completed" && t.status !== "cancelled");
    const done = ts.length - open.length;
    return { c, open: open.length, review: ts.filter((t) => t.status === "needs_review").length, pct: ts.length ? Math.round((done / ts.length) * 100) : 0 };
  });

  const setStatus = (t: Tab) =>
    navigate({ search: (p) => ({ ...p, status: t === "review" ? "needs_review" : t === "completed" ? "completed" : t === "waiting" ? "queued" : undefined }) });

  return (
    <div className="flex flex-col gap-4 py-3">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold tracking-tight">Tasks</h1>
        <Link to="/delegate" className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground">
          <Icon name="add" className="text-[18px]" /> New
        </Link>
      </div>

      <label className="flex h-11 items-center gap-2 rounded-xl bg-card px-3 shadow-sm focus-within:ring-2 focus-within:ring-ring">
        <Icon name="search" className="text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks, notes, results…" className="h-full flex-1 bg-transparent text-sm outline-none" />
        {q && <button onClick={() => setQ("")} aria-label="Clear search"><Icon name="close" className="text-muted-foreground text-[18px]" /></button>}
      </label>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => navigate({ search: (p) => ({ ...p, category: c === "All" ? undefined : c }) })}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
              category === c ? "bg-inverse text-inverse-foreground" : "bg-card text-muted-foreground shadow-sm",
            )}
          >
            {c}
            <span className="font-mono text-[11px] opacity-70">{c === "All" ? tasks.length : catCounts.get(c)}</span>
          </button>
        ))}
      </div>

      {hubs.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="label-caps text-muted-foreground">Orchestration Hubs</h2>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar">
            {hubs.map((h) => (
              <div key={h.c} className="card-surface w-56 shrink-0 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft/60 text-primary"><Icon name={categoryIcon(h.c)} className="text-[18px]" /></span>
                  <span className="rounded-full bg-info-soft/50 px-2 py-0.5 text-[11px] font-semibold text-on-info-soft">{h.open} Open</span>
                </div>
                <p className="mt-2 text-[14px] font-semibold">{h.c}</p>
                <p className="text-[12px] text-muted-foreground">{h.review ? `${h.review} waiting for review` : "No reviews pending"}</p>
                <div className="mt-2.5 flex items-center gap-2">
                  <ProgressBar value={h.pct} tone="success" />
                  <span className="font-mono text-[11px] text-muted-foreground">{h.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-mid p-1">
        {([
          ["active", "Active", groups.active.length],
          ["review", "Review", groups.review.length],
          ["waiting", "Upcoming", groups.waiting.length],
          ["completed", "Done", groups.completed.length],
        ] as const).map(([k, label, n]) => (
          <button
            key={k}
            onClick={() => setStatus(k)}
            className={cn("rounded-lg py-2 text-[12px] font-semibold transition-colors", tab === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
          >
            {label} ({n})
          </button>
        ))}
      </div>

      <TaskSelectionBar tasks={list} />
      <div className="flex flex-col gap-3">
        {isLoading ? (
          [0, 1].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-surface-mid" />)
        ) : list.length === 0 ? (
          <EmptyState
            icon="search_off"
            title="No Delegated Tasks Match"
            body="Try tweaking your search keywords or reset category filters to view ongoing orchestration."
            action={
              (q || category !== "All") && (
                <button onClick={() => { setQ(""); navigate({ search: (p) => ({ ...p, category: undefined }) }); }} className="mt-2 rounded-lg bg-surface-high px-3 py-2 text-[13px] font-semibold">
                  Clear Filters
                </button>
              )
            }
          />
        ) : (
          list.map((t) => <TaskCard key={t.id} task={t} />)
        )}
      </div>
    </div>
  );
}
