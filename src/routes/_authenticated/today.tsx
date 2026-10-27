import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Search, Plus, Check, ChevronDown, Keyboard, ArrowUpRight, ArrowRight, Network, X, UserRound } from "lucide-react";
import { useTasks } from "@/hooks/use-tasks";
import { TaskTimestamps } from "@/components/task-bits";
import { TaskSelectionBar, TaskCardActions, useTaskActions } from "@/components/task-actions";
import type { TaskStatus } from "@/lib/tasks";
import { Button } from "@/components/ui/button";
import { isOpen, relativeTime, type Task } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { PlatformBadges, InstinctLogo, detectPlatforms, PLATFORMS } from "@/components/platform-badges";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({ meta: [
    { title: "Second Brain Control Centre — Instinct Task Compass" },
    { name: "description", content: "Your live task board: agent activity, work in progress, decisions waiting on you and completed tasks." },
    { property: "og:title", content: "Second Brain Control Centre — Instinct Task Compass" },
    { property: "og:description", content: "Track your real Instinct tasks and agents in one compact control centre." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: Today,
});

function BoardCard({ task }: { task: Task }) {
  const { change } = useTaskActions();
  const waiting = task.status === "needs_review", done = task.status === "completed";
  return <article draggable onDragStart={e => { e.dataTransfer.setData("text/task-id", task.id); e.dataTransfer.effectAllowed = "move"; }} className={cn("cc-board-card cursor-grab active:cursor-grabbing min-w-0 rounded-lg border bg-card p-2.5", waiting ? "border-warning/40" : "border-border")}>
    <Link draggable={false} to="/tasks/$id" params={{ id: task.id }} className={cn("group flex items-start gap-2 text-[13px] font-medium leading-snug hover:text-primary", done && "text-muted-foreground")}>
      <h3 className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{task.title}</h3><ArrowUpRight className="mt-0.5 size-3 shrink-0 text-muted-foreground group-hover:text-primary" />
    </Link>
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className={cn("cc-label inline-flex items-center gap-1 rounded border px-1.5 py-0.5", task.source === "instinct" ? "border-primary/30 bg-primary-soft/40 text-primary" : "border-border bg-secondary text-muted-foreground")}>
        {task.source === "instinct" ? <InstinctLogo /> : <UserRound className="size-3" />}{task.source === "instinct" ? "Instinct" : "You"}
      </span><PlatformBadges task={task} />
    </div>
    {waiting && task.current_step && <p className="mt-1.5 flex items-start gap-1.5 rounded bg-warning-soft px-1.5 py-1 text-xs leading-snug text-warning"><ArrowRight className="mt-0.5 size-3 shrink-0" /><span className="break-words">{task.current_step}</span></p>}
    <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-1 text-[10px] text-muted-foreground"><span className="break-words">{task.category}</span><span className={cn("font-mono", task.priority === "urgent" && "text-destructive")}>{task.priority === "urgent" ? "Urgent · " : ""}{done ? task.completed_at ? `Done ${relativeTime(task.completed_at)}` : "Completion date unknown" : task.last_activity_at ? relativeTime(task.last_activity_at) : "Activity date unknown"}</span></div>
    <TaskTimestamps task={task} />
    <TaskCardActions task={task} compact />
    <select aria-label={`Move ${task.title}`} value="" onChange={e => { if (e.target.value) void change([task.id], e.target.value as TaskStatus); }} className="mt-1.5 h-7 w-full rounded border border-border bg-card px-1.5 text-[11px] text-muted-foreground md:hidden">
      <option value="" disabled>Move to…</option>
      {([["queued", "Backlog"], ["needs_review", "Needs you"], ["in_progress", "Being done"], ["completed", "Done"]] as const).filter(([v]) => v !== task.status).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
    {task.status === "in_progress" && <div className="mt-1.5 flex items-center gap-2"><progress aria-label={`${task.title} progress`} max={100} value={task.progress} className="h-0.5 min-w-0 flex-1 accent-info" /><span className="cc-label text-info">{task.progress}%</span></div>}
  </article>;
}

export function Today() {
  const { data: tasks = [], isLoading, error, dataUpdatedAt } = useTasks();
  const [query, setQuery] = useState("");
  const [agents, setAgents] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [view, setView] = useState("all");
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  const running = tasks.filter(t => t.status === "in_progress");
  const waiting = tasks.filter(t => t.status === "needs_review");
  const knownWaits = waiting.map(t => t.last_activity_at).filter((v): v is string => Boolean(v)).sort();
  const categoryNames = [...new Set(tasks.map(t => t.category))].sort();
  const taskAgents = (t: Task) => [t.source === "instinct" ? "instinct" : "you", ...detectPlatforms(t).map(p => p.key)];
  const tiles = [
    { key: "instinct", label: "Instinct", logo: "", initial: "In" },
    ...PLATFORMS.filter(p => tasks.some(t => taskAgents(t).includes(p.key))).map(p => ({ key: p.key, label: p.label, logo: p.logo || `https://cdn.simpleicons.org/${p.slug}/${p.color}`, initial: p.label.slice(0, 2) })),
    ...(tasks.some(t => t.source !== "instinct") ? [{ key: "you", label: "You", logo: "", initial: "You" }] : []),
  ];
  const [catOpen, setCatOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) { if (e.key === "Escape" && el === searchRef.current) searchRef.current?.blur(); return; }
      const k = e.key;
      if (k === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (k === "c") { e.preventDefault(); setCatOpen(true); }
      else if (k === "n") { e.preventDefault(); navigate({ to: "/delegate" }); }
      else if (k === "1") setView("all");
      else if (k === "2") setView("open");
      else if (k === "3") setView("done");
      else if (k === "w") document.getElementById("waiting-column")?.scrollIntoView({ behavior: "smooth", block: "start" });
      else if (k === "Escape") { setQuery(""); setAgents([]); setCategories([]); setView("all"); }
      else if (k === "?") { e.preventDefault(); setHelpOpen(o => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
  const toggle = (old: string[], key: string) => old.includes(key) ? old.filter(v => v !== key) : [...old, key];
  const hasFilters = query.trim() || agents.length || categories.length || view !== "all";
  const clear = () => { setQuery(""); setAgents([]); setCategories([]); setView("all"); };
  const filtered = tasks.filter(t => t.status !== "cancelled" && (view === "all" || (view === "done" ? t.status === "completed" : isOpen(t))) && (!agents.length || taskAgents(t).some(a => agents.includes(a))) && (!categories.length || categories.includes(t.category)) && [t.title, t.description, t.notes, t.current_step, t.category, ...taskAgents(t)].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const { change } = useTaskActions();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const columns = [
    { key: "backlog", name: "Backlog", hint: "Not started", status: "queued" as TaskStatus, dot: "border border-muted-foreground", rows: filtered.filter(t => t.status === "queued" || t.status === "scheduled") },
    { key: "waiting", name: "Needs you", hint: "Your move", status: "needs_review" as TaskStatus, dot: "rotate-45 rounded-sm bg-warning", rows: filtered.filter(t => t.status === "needs_review") },
    { key: "active", name: "Being done", hint: "Agents on it", status: "in_progress" as TaskStatus, dot: "bg-info motion-safe:animate-pulse", rows: filtered.filter(t => t.status === "in_progress") },
    { key: "done", name: "Done", hint: "Completed", status: "completed" as TaskStatus, dot: "bg-success", rows: filtered.filter(t => t.status === "completed") },
  ];
  return <div className="flex flex-col gap-3">
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2"><Network className="size-5 shrink-0" /><h1 className="text-base font-semibold">Second Brain</h1><span className="text-[13px] text-muted-foreground">Control centre</span></div>
      <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><span className={cn("size-1.5 rounded-full", error ? "bg-destructive" : "bg-success")} />{error ? "Sync unavailable" : dataUpdatedAt && now ? `Synced ${new Date(dataUpdatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "Syncing…"}</span><span>{running.length} running · {tasks.filter(isOpen).length} open</span><span>{now?.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span></div>
      <Button asChild size="sm" className="h-8 bg-foreground text-background hover:bg-foreground/90"><Link to="/delegate"><Plus className="size-3.5" />New task</Link></Button>
    </header>
    <section aria-label="Agents" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap">
      <Button variant="outline" aria-pressed={view === "open" && !agents.length && !categories.length} onClick={() => { clear(); setView("open"); document.getElementById("waiting-column")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="h-auto min-h-14 justify-start gap-3 border-warning/40 bg-warning-soft px-3 text-left lg:flex-[1.3]">
        <span className="font-mono text-2xl font-medium text-warning">{waiting.length}</span><span className="flex flex-col gap-0.5"><span className="text-[13px] text-warning">Need you</span><span className="font-mono text-[10px] text-muted-foreground">{waiting.length ? knownWaits[0] ? `oldest ${relativeTime(knownWaits[0])}` : "Wait date unknown" : "All clear"}</span></span>
      </Button>
      {tiles.map(a => { const mine = tasks.filter(t => taskAgents(t).includes(a.key)), active = mine.filter(t => t.status === "in_progress").length, needs = mine.filter(t => t.status === "needs_review").length; if (!active && !needs && !agents.includes(a.key)) return null; return <Button key={a.key} variant="outline" aria-pressed={agents.includes(a.key)} onClick={() => setAgents(toggle(agents, a.key))} className={cn("h-auto min-h-14 min-w-0 flex-col items-start justify-center gap-1 bg-card px-3 text-left lg:min-w-32 lg:flex-1", agents.includes(a.key) && "border-primary bg-primary-soft/30")}><span className="flex items-center gap-2 text-[13px]">{a.key === "instinct" ? <InstinctLogo className="size-5" /> : a.logo ? <img src={a.logo} alt="" className="size-5 object-contain" onError={e => { e.currentTarget.style.display = "none"; }} /> : <UserRound className="size-4 text-muted-foreground" />}{a.label}</span><span className="font-mono text-[10px] text-muted-foreground">{active ? `${active} running` : "Idle"}{needs ? ` · ${needs} for you` : ""}</span></Button>; })}
    </section>
    <section aria-label="Task filters" className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Task view" className="flex gap-0.5 rounded-lg border border-border bg-card p-0.5">{[["all", "All", tasks.filter(t => t.status !== "cancelled").length], ["open", "Open", tasks.filter(isOpen).length], ["done", "Done", tasks.filter(t => t.status === "completed").length]].map(([key, label, count]) => <Button key={key} variant="ghost" size="sm" aria-pressed={view === key} onClick={() => setView(String(key))} className={cn("h-7 gap-1.5 px-2 text-xs", view === key ? "bg-secondary text-foreground" : "text-muted-foreground")}>{label}<span className="font-mono text-[10px]">{count}</span></Button>)}</div>
      <Popover open={catOpen} onOpenChange={setCatOpen}><PopoverTrigger asChild><Button variant="outline" size="sm" aria-label="Filter by category (shortcut C)" className={cn("h-8 gap-1.5 text-xs", categories.length && "border-foreground")}>{categories.length ? categories.length === 1 ? categories[0] : `${categories.length} categories` : "All categories"}<kbd className="rounded border border-border px-1 font-mono text-[9px] text-muted-foreground">C</kbd><ChevronDown className="size-3" /></Button></PopoverTrigger><PopoverContent align="start" className="w-64 p-0"><Command><CommandInput placeholder="Find category…" /><CommandList><CommandEmpty>No category found</CommandEmpty><CommandGroup>{categories.length > 0 && <CommandItem onSelect={() => setCategories([])}>Show all categories</CommandItem>}{categoryNames.map(c => <CommandItem key={c} value={c} onSelect={() => setCategories(toggle(categories, c))}><Check className={cn("size-3.5", categories.includes(c) ? "opacity-100" : "opacity-0")} /><span className="flex-1">{c}</span><span className="font-mono text-[10px] text-muted-foreground">{tasks.filter(t => t.category === c && t.status !== "cancelled").length}</span></CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover>
      <div className="flex-1" />
      {Boolean(hasFilters) && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clear}><X className="size-3" />Clear filters</Button>}
      <label className="relative min-w-0 grow sm:max-w-56"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><input ref={searchRef} type="search" aria-label="Search tasks (shortcut /)" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tasks  /" className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring" /></label>
      <Popover open={helpOpen} onOpenChange={setHelpOpen}><PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-8 px-2" aria-label="Keyboard shortcuts (?)"><Keyboard className="size-4" /></Button></PopoverTrigger><PopoverContent align="end" className="w-60 p-3 text-xs"><p className="mb-2 font-semibold">Keyboard shortcuts</p><dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">{[["/", "Search tasks"], ["C", "Find a category"], ["1 / 2 / 3", "All / Open / Done"], ["W", "Jump to Waiting on you"], ["N", "New task"], ["Esc", "Clear filters"], ["?", "Show this list"]].map(([k, d]) => <Fragment key={k}><dt><kbd className="rounded border border-border bg-secondary px-1.5 font-mono text-[10px]">{k}</kbd></dt><dd className="text-muted-foreground">{d}</dd></Fragment>)}</dl></PopoverContent></Popover>
    </section>
    <TaskSelectionBar tasks={filtered} />
    {error ? <p role="alert" className="text-sm text-destructive">Tasks couldn’t load. Please refresh.</p> : <main className="cc-board">{columns.map(col => <section key={col.key} id={col.key === "waiting" ? "waiting-column" : undefined} aria-label={col.name} onDragOver={e => { if (e.dataTransfer.types.includes("text/task-id")) { e.preventDefault(); setDragOver(col.key); } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null); }} onDrop={e => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/task-id"); const t = tasks.find(x => x.id === id); if (t && !col.rows.some(r => r.id === id) && t.status !== col.status) void change([id], col.status); }} className={cn("min-h-40 min-w-0 space-y-2 rounded-lg border p-2 transition-colors", col.key === "waiting" ? "border-warning/40 bg-warning-soft" : "border-transparent bg-muted", dragOver === col.key && "border-primary bg-primary-soft/30 ring-1 ring-primary")}><header className="flex min-h-7 flex-wrap items-center gap-2 px-1"><span className={cn("size-2 shrink-0 rounded-full", col.dot)} /><h2 className="text-[13px] font-semibold">{col.name}</h2><span className="font-mono text-[11px] text-muted-foreground">{col.rows.length}</span><span className="ml-auto text-[10px] text-muted-foreground">{col.hint}</span></header>{isLoading ? <div className="h-32 animate-pulse rounded bg-card" /> : col.rows.length ? col.rows.map(t => <BoardCard key={t.id} task={t} />) : <p className="rounded-lg border border-dashed border-border px-2 py-6 text-center text-xs text-muted-foreground">{hasFilters ? "Nothing matches these filters" : "Drop tasks here"}</p>}</section>)}</main>}
  </div>;
}
