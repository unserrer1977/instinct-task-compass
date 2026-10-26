import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, ArrowUpRight, Bot, Check, SlidersHorizontal, X, Activity, SquareDashed } from "lucide-react";
import { useTasks, recentUpdatesQuery } from "@/hooks/use-tasks";
import { TaskTimestamps, EventTime } from "@/components/task-bits";
import { TaskSelectionBar, TaskCardActions } from "@/components/task-actions";
import { Button } from "@/components/ui/button";
import { isOpen, relativeTime, type Task } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({ meta: [
    { title: "Control Centre — Instinct Task Compass" },
    { name: "description", content: "Your live Instinct control centre: running tasks, upcoming work, and decisions that need you." },
    { property: "og:title", content: "Control Centre — Instinct Task Compass" },
    { property: "og:description", content: "Track your Instinct tasks and take action from one live control centre." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: Today,
});

function Owner({ task }: { task: Task }) {
  return <span className={cn("cc-label inline-flex items-center gap-1.5 rounded-sm border px-2 py-1", task.source === "instinct" ? "border-primary/40 bg-primary-soft/40 text-primary" : "border-warning/40 bg-warning-soft/40 text-warning")}>
    {task.source === "instinct" ? <Bot className="size-3" /> : <span className="size-1.5 bg-warning" />}{task.source === "instinct" ? "Instinct" : "You"}
  </span>;
}
function Status({ task }: { task: Task }) {
  const review = task.status === "needs_review", done = task.status === "completed";
  return <span className={cn("cc-label inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-1", review ? "border-info/40 bg-info-soft text-info" : done ? "border-primary/30 text-primary" : "border-border text-muted-foreground")}>
    <span className={cn("size-1.5", review ? "rotate-45 bg-info" : done ? "rounded-full bg-primary" : task.status === "in_progress" ? "rounded-full bg-foreground motion-safe:animate-pulse" : "rounded-full border border-muted-foreground")} />
    {review ? "Needs you" : done ? "Done" : task.status === "in_progress" ? "Running" : task.status === "cancelled" ? "Cancelled" : "Queued"}
  </span>;
}
function TaskRow({ task, backlog = false }: { task: Task; backlog?: boolean }) {
  return <article className={cn("min-w-0", backlog ? "rounded-md border border-dashed border-input bg-surface-low p-3" : "border-t border-border px-4 py-4 md:px-5")}>
    <div className={backlog ? "flex flex-col gap-2" : "cc-row"}>
      {!backlog && <Status task={task} />}
      <div className="min-w-0">
        <Link to="/tasks/$id" params={{ id: task.id }} className="group flex items-start justify-between gap-3 text-[15px] font-medium leading-snug hover:text-primary"><span className="break-words [overflow-wrap:anywhere]">{task.title}</span><ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" /></Link>
        {(task.current_step || task.description) && <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{task.current_step || task.description}</p>}
        {task.status === "in_progress" && <div className="mt-2 flex items-center gap-2"><progress aria-label={`${task.title} progress`} max={100} value={task.progress} className="h-1 w-full max-w-48 overflow-hidden rounded-full accent-primary" /><span className="cc-label text-primary">{task.progress}%</span></div>}
      </div>
      <div className="flex flex-wrap items-center gap-2"><Owner task={task} /><span className="cc-label text-muted-foreground">{relativeTime(task.last_activity_at)}</span></div>
    </div>
    <TaskTimestamps task={task} />
    <TaskCardActions task={task} />
  </article>;
}

function Today() {
  const { data: tasks = [], isLoading, error } = useTasks();
  const { data: updates = [] } = useQuery(recentUpdatesQuery);
  const [q, setQ] = useState("");
  const [who, setWho] = useState("all");
  const [where, setWhere] = useState("all");
  const [show, setShow] = useState("everything");
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  const live = tasks.filter(isOpen);
  const running = live.filter(t => t.status === "in_progress");
  const needs = live.filter(t => t.status === "needs_review");
  const backlog = live.filter(t => t.status === "queued" || t.status === "scheduled");
  const categories = [...new Set(tasks.map(t => t.category))].sort();
  const filtered = tasks.filter(t => (who === "all" || (who === "instinct" ? t.source === "instinct" : t.source !== "instinct")) && (where === "all" || t.category === where) && (show === "done" ? t.status === "completed" : isOpen(t) && (show === "everything" || (show === "flight" ? t.status === "in_progress" || t.status === "needs_review" : t.status === "queued" || t.status === "scheduled"))) && `${t.title} ${t.description ?? ""} ${t.notes ?? ""} ${t.category}`.toLowerCase().includes(q.toLowerCase()));
  const clear = () => { setQ(""); setWho("all"); setWhere("all"); setShow("everything"); };
  const hasFilters = q || who !== "all" || where !== "all" || show !== "everything";
  const own = live.filter(t => t.source === "instinct").length;
  return <div className="flex flex-col gap-7">
    <header className="flex flex-wrap items-center gap-4 border-b border-border pb-5">
      <Link to="/today" className="flex shrink-0 items-center gap-2.5"><SquareDashed className="size-6 text-primary" /><span className="cc-heading text-lg">CONTROL CENTRE</span></Link>
      <label className="relative min-w-0 flex-1 basis-60"><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" /><input aria-label="Search tasks" value={q} onChange={e => setQ(e.target.value)} placeholder="Search tasks or categories" className="h-11 w-full rounded-md border border-border bg-muted pl-10 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" /></label>
      <div className="flex flex-wrap items-center gap-4"><span className="cc-label flex items-center gap-2 text-muted-foreground"><span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />Instinct live · {running.filter(t => t.source === "instinct").length} running</span><Link to="/delegate" className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="size-4" />New task</Link></div>
    </header>

    <section className="flex flex-wrap items-end justify-between gap-6 py-2">
      <div className="min-w-0"><p className="cc-label mb-4 text-muted-foreground">{now ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "Today"} · Live status</p><h1 className="cc-heading text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">{live.length} in flight.<br /><span className="text-info">{needs.length} need you.</span></h1><p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">Instinct is carrying <strong className="text-primary">{own}</strong> of the live tasks. <strong className="text-warning">{live.length - own}</strong> are in your hands.</p></div>
      <div className="grid w-full grid-cols-3 gap-2 sm:w-auto">{([{ label: "Running now", n: running.length, cls: "text-foreground" }, { label: "Needs you", n: needs.length, cls: "text-info" }, { label: "Backlog", n: backlog.length, cls: "text-muted-foreground" }]).map(k => <div key={k.label} className="min-w-0 rounded-md border border-border bg-muted p-4 sm:min-w-32"><p className="cc-label text-muted-foreground">{k.label}</p><p className={cn("cc-heading mt-2 text-3xl", k.cls)}>{k.n}</p></div>)}</div>
    </section>

    <section aria-labelledby="matrix-title" className="border-y border-border bg-card/80 py-5">
      <h2 id="matrix-title" className="cc-heading mb-4 text-sm">WHO × WHERE</h2>
      <div className="overflow-x-auto pb-2"><div className="min-w-max" style={{ "--cc-columns": Math.max(1, categories.length) } as CSSProperties}>
        <div className="cc-matrix mb-2 items-center"><span className="cc-label text-muted-foreground">Task categories</span>{(categories.length ? categories : ["No categories"]).map(c => <Button key={c} variant="ghost" aria-pressed={where === c} onClick={() => setWhere(where === c ? "all" : c)} className={cn("h-auto min-h-10 whitespace-normal text-xs", where === c ? "text-primary bg-primary-soft" : "text-muted-foreground")}>{c}</Button>)}<span className="cc-label text-right text-muted-foreground">Live</span></div>
        {(["instinct", "you"] as const).map(owner => <div key={owner} className="cc-matrix mb-1.5"><Button variant="outline" aria-pressed={who === owner} onClick={() => setWho(who === owner ? "all" : owner)} className="h-auto min-h-20 flex-col items-start bg-muted px-4"><span className={cn("cc-label", owner === "instinct" ? "text-primary" : "text-warning")}>{owner === "instinct" ? "Instinct" : "You"}</span><span className="text-sm">{owner === "instinct" ? "Instinct runs it" : "You run it"}</span></Button>{(categories.length ? categories : ["No categories"]).map(c => { const matches = live.filter(t => t.category === c && (owner === "instinct" ? t.source === "instinct" : t.source !== "instinct")); return <Button variant="outline" key={c} aria-label={`${owner === "instinct" ? "Instinct" : "You"}, ${c}: ${matches.length} live tasks`} aria-pressed={who === owner && where === c} onClick={() => { setWho(owner); setWhere(c); setShow("everything"); }} className={cn("h-auto min-h-20 flex-col items-start justify-between bg-muted p-3", who === owner && where === c && "border-primary")}><span className={cn("cc-heading text-2xl", matches.length ? owner === "instinct" ? "text-primary" : "text-warning" : "text-muted-foreground")}>{matches.length}</span><span className="cc-label text-muted-foreground">{matches.filter(t => t.status === "queued" || t.status === "scheduled").length} queued</span></Button>; })}<span className={cn("cc-heading flex items-center justify-end text-3xl", owner === "instinct" ? "text-primary" : "text-warning")}>{live.filter(t => owner === "instinct" ? t.source === "instinct" : t.source !== "instinct").length}</span></div>)}
      </div></div>
      <div className="mt-3 flex flex-wrap gap-5 text-xs text-muted-foreground"><span>● Running</span><span className="text-info">◆ Needs you</span><span>○ Queued</span></div>
    </section>

    <section aria-label="Task filters" className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <SlidersHorizontal className="size-4 text-muted-foreground" />
      <Filter label="Who" value={who} options={[["all", "Everyone"], ["instinct", "Instinct"], ["you", "You, direct"]]} change={setWho} />
      <label className="flex items-center gap-2"><span className="cc-label text-muted-foreground">Where</span><select aria-label="Filter category" value={where} onChange={e => setWhere(e.target.value)} className="h-9 max-w-52 rounded-md border border-border bg-muted px-2 text-xs"><option value="all">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
      <Filter label="Show" value={show} options={[["everything", "Everything"], ["flight", "In flight"], ["backlog", "Backlog"], ["done", "Done"]]} change={setShow} />
      <span className="cc-label ml-auto text-muted-foreground">Showing {filtered.length} of {tasks.length} tasks</span>{hasFilters && <Button size="sm" variant="outline" onClick={clear}><X />Clear filters</Button>}
    </section>
    <TaskSelectionBar tasks={filtered} />

    <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-7">
        {isLoading ? <div className="h-64 animate-pulse bg-muted" /> : error ? <p role="alert" className="text-destructive">Tasks couldn’t load. Please refresh.</p> : filtered.length === 0 ? <div className="border-y border-dashed border-input py-12 text-center"><p className="cc-heading text-xl">{tasks.length ? "Nothing matches these filters" : "No tasks yet"}</p>{hasFilters && <Button className="mt-4" variant="outline" onClick={clear}>Clear filters</Button>}</div> : categories.map(category => {
          const group = filtered.filter(t => t.category === category); if (!group.length) return null;
          const queued = group.filter(t => t.status === "queued" || t.status === "scheduled"), flight = group.filter(t => t.status !== "queued" && t.status !== "scheduled");
          return <section key={category} className="border-y border-border bg-card/90"><header className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 md:px-5"><div><h2 className="cc-heading text-2xl">{category}</h2><p className="mt-1 text-xs text-muted-foreground">{group.filter(t => t.source === "instinct").length} Instinct · {group.filter(t => t.source !== "instinct").length} You</p></div><span className="cc-label text-muted-foreground">{flight.length} in flight · {queued.length} backlog</span></header>{flight.length > 0 && <div className="cc-row cc-row-header border-t border-border bg-surface-low px-5 py-2 cc-label text-muted-foreground"><span>Status</span><span>{show === "done" ? "Completed" : "In flight"}</span><span>Who · Updated</span></div>}{flight.map(t => <TaskRow key={t.id} task={t} />)}{queued.length > 0 && <div className="border-t border-border bg-surface-low p-4 md:p-5"><p className="cc-label mb-3 text-muted-foreground">Backlog · {queued.length}</p><div className="grid gap-3 md:grid-cols-2">{queued.map(t => <TaskRow key={t.id} task={t} backlog />)}</div></div>}</section>;
        })}
      </div>
      <aside className="min-w-0 space-y-7">
        <section className="border-y border-info/40 bg-card/90"><header className="flex items-center justify-between p-4"><h2 className="cc-heading text-sm text-info">NEEDS YOU</h2><span className="flex size-7 items-center justify-center rounded-full bg-info text-primary-foreground text-sm font-semibold">{needs.length}</span></header>{needs.length ? needs.map(t => <div key={t.id} className="border-t border-border p-4"><Status task={t} /><Link to="/tasks/$id" params={{ id: t.id }} className="mt-3 block break-words text-sm font-medium [overflow-wrap:anywhere] hover:text-info">{t.title}</Link><p className="mt-1 text-xs text-muted-foreground">{t.category}</p><TaskTimestamps task={t} /><TaskCardActions task={t} /></div>) : <p className="border-t border-border p-4 text-sm text-muted-foreground"><Check className="mb-2 size-5 text-primary" />All clear — nothing needs your review.</p>}</section>
        <section className="border-y border-border bg-card/90"><header className="flex items-center justify-between p-4"><h2 className="cc-heading text-sm">LIVE ACTIVITY</h2><Activity className="size-4 text-primary" /></header>{updates.length ? updates.slice(0, 8).map(u => <div key={u.id} className="border-t border-border p-4"><EventTime u={u} /><p className="mt-2 break-words text-sm [overflow-wrap:anywhere]">{u.message}</p><Link to="/tasks/$id" params={{ id: u.task_id }} className="mt-2 block break-words text-xs text-primary [overflow-wrap:anywhere]">{u.tasks?.title ?? "View task"}</Link></div>) : <p className="border-t border-border p-4 text-sm text-muted-foreground">No activity yet.</p>}<Link to="/history" className="flex items-center justify-between border-t border-border p-4 text-xs text-muted-foreground hover:text-primary">View all activity<ArrowUpRight className="size-4" /></Link></section>
      </aside>
    </div>
  </div>;
}
function Filter({ label, value, options, change }: { label: string; value: string; options: [string, string][]; change: (v: string) => void }) {
  return <div className="flex flex-wrap items-center gap-1.5"><span className="cc-label mr-1 text-muted-foreground">{label}</span>{options.map(([v, title]) => <Button key={v} variant={value === v ? "secondary" : "outline"} size="sm" aria-pressed={value === v} onClick={() => change(v)} className={cn("rounded-full text-xs", value === v && "bg-foreground text-background hover:bg-foreground/90")}>{title}</Button>)}</div>;
}
