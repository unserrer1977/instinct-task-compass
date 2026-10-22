import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { recentUpdatesQuery } from "@/hooks/use-tasks";
import { Icon } from "@/components/app-shell";
import { EmptyState } from "@/components/task-bits";
import { formatDateTime } from "@/lib/tasks";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "History — Instinct Hub" },
      { name: "description", content: "A timeline of every update Instinct and you have made to your tasks." },
      { property: "og:title", content: "History — Instinct Hub" },
      { property: "og:description", content: "A timeline of every update Instinct and you have made to your tasks." },
    ],
  }),
  component: History,
});

function History() {
  const { data = [], isLoading } = useQuery(recentUpdatesQuery);
  return (
    <div className="flex flex-col gap-4 py-3">
      <h1 className="text-[22px] font-semibold tracking-tight">History</h1>
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface-mid" />
      ) : data.length === 0 ? (
        <EmptyState icon="fact_check" title="No activity yet" body="Every update from Instinct and from you will be logged here." />
      ) : (
        <div className="card-surface divide-y divide-border">
          {data.map((u) => (
            <Link key={u.id} to="/tasks/$id" params={{ id: u.task_id }} className="flex gap-3 p-3.5 hover:bg-surface-low/60">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${u.kind === "completed" ? "bg-success-soft/50 text-on-success-soft" : "bg-primary-soft/60 text-primary"}`}>
                <Icon name={u.source === "instinct" ? "neurology" : "person"} className="text-[17px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <p className="truncate text-[13px] font-semibold">{(u.tasks as { title: string } | null)?.title ?? "Task"}</p>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatDateTime(u.created_at)}</span>
                </div>
                <p className="line-clamp-2 text-[13px] text-muted-foreground">{u.message}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
