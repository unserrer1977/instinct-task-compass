import { createFileRoute, Link } from "@tanstack/react-router";
import { Today } from "@/components/control-board";
import { isCareerTask } from "@/lib/new-job-tasks";

export const Route = createFileRoute("/_authenticated/new-job")({
  head: () => ({ meta: [
    { title: "Work & Career — Instinct Task Compass" },
    { name: "description", content: "Instinct tasks, job searching, current work and job applications together in one task board." },
    { property: "og:title", content: "Work & Career — Instinct Task Compass" },
    { property: "og:description", content: "Track Instinct work, current-job priorities, applications and career preparations." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: NewJob,
});

function NewJob() {
  return <div className="space-y-3">
    <Link to="/today" className="text-xs text-muted-foreground hover:text-primary">← All tasks</Link>
    <Today title="Work & career" subtitle="Instinct · jobs · applications" taskScope={isCareerTask} emptyMessage="No matching work or career tasks yet." />
  </div>;
}