import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { assistantQuery } from "@/hooks/use-assistant";
import { TaskAssistant } from "@/components/task-assistant";

export const Route = createFileRoute("/_authenticated/discussions/$topicId")({
  loader: ({ context }) => context.queryClient.ensureQueryData(assistantQuery),
  head: () => ({
    meta: [
      { title: "Topic Discussion — Instinct Task Assistant" },
      {
        name: "description",
        content: "Review a topic’s saved task questions, answers and suggested next steps.",
      },
      { property: "og:title", content: "Topic Discussion — Instinct Task Assistant" },
      { property: "og:description", content: "Your saved Instinct discussion organised by topic." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: function TopicPage() {
    const { data } = useSuspenseQuery(assistantQuery);
    const { topicId } = Route.useParams();
    return <TaskAssistant initial={data} viewedTopic={topicId} />;
  },
});
