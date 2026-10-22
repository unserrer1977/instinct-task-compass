import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { assistantQuery } from "@/hooks/use-assistant";
import { TaskAssistant } from "@/components/task-assistant";

export const Route = createFileRoute("/_authenticated/assistant")({
  loader: ({ context }) => context.queryClient.ensureQueryData(assistantQuery),
  head: () => ({
    meta: [
      { title: "Ask Instinct — Task Assistant" },
      {
        name: "description",
        content: "Ask questions about your Instinct tasks, progress and next steps.",
      },
      { property: "og:title", content: "Ask Instinct — Task Assistant" },
      {
        property: "og:description",
        content: "Task-grounded answers and automatically organised discussions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => {
    const { data } = useSuspenseQuery(assistantQuery);
    return <TaskAssistant initial={data} />;
  },
});
