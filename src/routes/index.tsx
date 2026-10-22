import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Instinct Hub — your AI assistant's task dashboard" },
      { name: "description", content: "Track every task you've delegated to Instinct: what's running, waiting and done." },
      { property: "og:title", content: "Instinct Hub — your AI assistant's task dashboard" },
      { property: "og:description", content: "Track every task you've delegated to Instinct: what's running, waiting and done." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/today" });
  },
});
