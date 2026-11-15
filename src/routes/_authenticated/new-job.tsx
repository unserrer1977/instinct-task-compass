import { createFileRoute, Link } from "@tanstack/react-router";
import { Today } from "@/components/control-board";
import { isNewJobTask } from "@/lib/new-job-tasks";

export const Route = createFileRoute("/_authenticated/new-job")({
  head: () => ({ meta: [
    { title: "New Job — Instinct Task Compass" },
    { name: "description", content: "Track tasks explicitly linked to your new job role, including decisions, work in progress and completed preparations." },
    { property: "og:title", content: "New Job — Instinct Task Compass" },
    { property: "og:description", content: "Your new-role task board, with progress, next actions and replies to Instinct." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: NewJob,
});

function NewJob() {
  return <div className="space-y-3">
    <Link to="/today" className="text-xs text-muted-foreground hover:text-primary">← All tasks</Link>
    <Today title="New job" subtitle="Role preparations" taskScope={isNewJobTask} emptyMessage="No tasks explicitly linked to your new role yet." />
  </div>;
}