import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Network, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstinctLogo } from "@/components/platform-badges";
import { tasksQuery } from "@/hooks/use-tasks";
import { connectionStatusQuery } from "@/hooks/use-connection-status";
import { connectionLabel, pendingInstinctTasks } from "@/lib/connection-status";
import { formatTaskTimestamp } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/connections")({
  loader: async ({ context }) => {
    await Promise.all([context.queryClient.ensureQueryData(connectionStatusQuery), context.queryClient.ensureQueryData(tasksQuery)]);
  },
  head: () => ({ meta: [
    { title: "Instinct Connection Status — Task Compass" },
    { name: "description", content: "Review Instinct connections, last received task activity, and outstanding tasks in Task Compass." },
    { property: "og:title", content: "Instinct Connection Status — Task Compass" },
    { property: "og:description", content: "Real connection activity, task transfers, and pending Instinct work." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Connections,
});

function Connections() {
  const qc = useQueryClient();
  const { data, isFetching, isRefetchError } = useSuspenseQuery(connectionStatusQuery);
  const { data: tasks } = useSuspenseQuery(tasksQuery);
  const [now, setNow] = useState(0);
  const [filter, setFilter] = useState("all");
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const pending = pendingInstinctTasks(tasks);
  const lastSent = data.transfers[0];
  const active = data.credentials.filter((credential) => !credential.revoked_at);
  const visible = pending.filter((task) => filter === "all" || task.status === filter);
  const groups = [["all", "All pending"], ["needs_review", "Needs you"], ["in_progress", "Being done"], ["queued", "Backlog"], ["scheduled", "Scheduled"]] as const;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["mcp_credential"] }); void qc.invalidateQueries({ queryKey: ["tasks"] }); };

  return <div className="flex flex-col gap-5">
    <Link to="/today" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"><ArrowLeft className="size-3.5" />Back to Control Centre</Link>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="flex items-center gap-2 text-xl font-semibold"><Network className="size-5 text-primary" />Connection status</h1>
      <div className="flex gap-2"><Button variant="outline" size="sm" disabled={isFetching} onClick={refresh}><RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />Refresh</Button><Button asChild size="sm" variant="secondary"><Link to="/settings"><Settings className="size-3.5" />Manage connection</Link></Button></div>
    </header>
    {isRefetchError && <p role="alert" className="text-sm text-destructive">Connection activity couldn’t refresh. Showing the last available records.</p>}
    <dl className="grid gap-4 border-y border-border py-4 sm:grid-cols-3">
      <div><dt className="text-xs text-muted-foreground">Enabled connections</dt><dd className="mt-1 text-2xl font-semibold">{active.length}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Last sent by Instinct · received here</dt><dd className="mt-1 text-sm font-mono">{lastSent ? formatTaskTimestamp(lastSent.receivedAt) : "No task transfers recorded"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Pending Instinct tasks on this board</dt><dd className="mt-1 text-2xl font-semibold">{pending.length}</dd></div>
    </dl>
    <section aria-label="Instinct connections" className="space-y-3">
      <h2 className="text-sm font-semibold">Instinct connections</h2>
      <p className="text-xs text-muted-foreground">Activity is tracked per connection key, not per individual agent. Agents sharing a key appear together. Recent contact includes connection tests and does not confirm every task was sent.</p>
      {data.credentials.length ? <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{data.credentials.map((credential) => <article key={credential.id} className="min-w-0 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold"><InstinctLogo className="size-5 shrink-0" /><span className="break-words">{credential.name}</span></h3><span className={cn("flex items-center gap-1.5 text-xs", credential.revoked_at ? "text-muted-foreground" : credential.last_used_at && now - Date.parse(credential.last_used_at) <= 15 * 60_000 ? "text-success" : "text-warning")}><span className="size-1.5 rounded-full bg-current" />{now ? connectionLabel(credential, now) : "Checking…"}</span></div>
        <dl className="mt-3 space-y-2 text-xs"><div><dt className="text-muted-foreground">Last contact</dt><dd className="mt-0.5 font-mono">{credential.last_used_at ? formatTaskTimestamp(credential.last_used_at) : "Never contacted"}</dd></div><div><dt className="text-muted-foreground">Created</dt><dd className="mt-0.5 font-mono">{formatTaskTimestamp(credential.created_at)}</dd></div>{credential.revoked_at && <div><dt className="text-muted-foreground">Revoked</dt><dd className="mt-0.5 font-mono">{formatTaskTimestamp(credential.revoked_at)}</dd></div>}</dl>
      </article>)}</div> : <p className="border-y border-dashed border-border py-6 text-sm text-muted-foreground">No Instinct connection is configured. <Link to="/settings" className="text-primary underline">Set up a connection</Link></p>}
    </section>
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-label="Pending Instinct tasks" className="min-w-0 space-y-3">
        <h2 className="text-sm font-semibold">Pending tasks</h2>
        <p className="text-xs text-muted-foreground">Only tasks already sent to this board are visible. Work still held only by Instinct cannot be counted here.</p>
        <div role="group" aria-label="Pending task status" className="flex flex-wrap gap-1">{groups.map(([key, label]) => <Button key={key} size="sm" variant={filter === key ? "secondary" : "ghost"} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}<span className="font-mono text-muted-foreground">{key === "all" ? pending.length : pending.filter((task) => task.status === key).length}</span></Button>)}</div>
        <ul className="divide-y divide-border">{visible.map((task) => <li key={task.id}><Link to="/tasks/$id" params={{ id: task.id }} className="flex items-start justify-between gap-2 py-3 hover:text-primary"><div className="min-w-0"><p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{task.title}</p><p className="mt-1 text-xs text-muted-foreground">{groups.find(([key]) => key === task.status)?.[1]} · {task.category}</p>{task.current_step && <p className="mt-1 break-words text-xs text-muted-foreground">{task.current_step}</p>}</div><ArrowUpRight className="size-4 shrink-0 text-muted-foreground" /></Link></li>)}</ul>
        {!visible.length && <p className="py-4 text-sm text-muted-foreground">No pending tasks in this status.</p>}
      </section>
      <section aria-label="Recent Instinct transfers" className="min-w-0 space-y-3">
        <h2 className="text-sm font-semibold">Last sent · recent transfers</h2>
        <p className="text-xs text-muted-foreground">Account-wide task, activity, and file arrivals. Times show receipt here, not historical task dates; transfers aren’t attributed to individual connection keys.</p>
        <ol className="divide-y divide-border">{data.transfers.map((transfer) => <li key={transfer.id}><Link to="/tasks/$id" params={{ id: transfer.taskId }} className="block py-3 hover:text-primary"><p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{transfer.title}</p><p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{transfer.detail}</p><time dateTime={transfer.receivedAt} className="mt-1 block text-xs font-mono text-muted-foreground">{formatTaskTimestamp(transfer.receivedAt)}</time></Link></li>)}</ol>
        {!data.transfers.length && <p className="py-4 text-sm text-muted-foreground">No task transfers recorded from Instinct.</p>}
      </section>
    </div>
  </div>;
}