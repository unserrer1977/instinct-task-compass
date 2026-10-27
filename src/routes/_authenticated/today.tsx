import { createFileRoute } from "@tanstack/react-router";
import { Today } from "@/components/control-board";

export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({ meta: [
    { title: "Second Brain Control Centre — Instinct Task Compass" },
    { name: "description", content: "Your live task board: agent activity, work in progress, decisions waiting on you and completed tasks." },
    { property: "og:title", content: "Second Brain Control Centre — Instinct Task Compass" },
    { property: "og:description", content: "Track your real Instinct tasks and agents in one compact control centre." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: Today,
});

