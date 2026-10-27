import { createFileRoute, Link } from "@tanstack/react-router";
import { DemoMode } from "@/hooks/use-tasks";
import { TaskActionsProvider } from "@/components/task-actions";
import { Today } from "@/components/control-board";

export const Route = createFileRoute("/demo")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Demo — Instinct Task Compass" },
    { name: "description", content: "Try the Instinct Task Compass control centre with sample tasks. No sign-in needed." },
    { property: "og:title", content: "Demo — Instinct Task Compass" },
    { property: "og:description", content: "A live sample of the Second Brain control centre with demo tasks and agents." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Demo,
});

function Demo() {
  return <DemoMode.Provider value={true}>
    <div className="control-centre min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-warning-soft px-3 py-1.5 text-center text-xs text-warning">
        Demo mode · sample tasks only, changes aren't saved · <Link to="/auth" className="underline">Sign in</Link>
      </div>
      <main className="mx-auto max-w-[1680px] px-3 pb-10 pt-3 md:px-[18px]"><TaskActionsProvider><Today /></TaskActionsProvider></main>
    </div>
  </DemoMode.Provider>;
}
