import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { UIMessage } from "ai";

import type { Tables } from "@/integrations/supabase/types";
export type AssistantData = {
  topics: Tables<"assistant_topics">[];
  messages: UIMessage[];
  assignments: Record<string, string>;
};

export const assistantQuery = queryOptions({
  queryKey: ["assistant"],
  queryFn: async (): Promise<AssistantData> => {
    const [topics, messages] = await Promise.all([
      supabase.from("assistant_topics").select("*").order("updated_at", { ascending: false }),
      supabase.from("assistant_messages").select("*").order("created_at", { ascending: true }),
    ]);
    if (topics.error) throw topics.error;
    if (messages.error) throw messages.error;
    return {
      topics: topics.data ?? [],
      messages: (messages.data ?? []).map((row) => row.message as unknown as UIMessage),
      assignments: Object.fromEntries(
        (messages.data ?? []).map((row) => [row.message_id, row.topic_id ?? ""]),
      ) as Record<string, string>,
    };
  },
});
