import { useEffect } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Task, TaskUpdate } from "@/lib/tasks";

export const tasksQuery = queryOptions({
  queryKey: ["tasks"],
  queryFn: async (): Promise<Task[]> => {
    const { data, error } = await supabase.from("tasks").select("*").order("sort_activity_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

export const taskUpdatesQuery = (taskId: string) =>
  queryOptions({
    queryKey: ["task_updates", taskId],
    queryFn: async (): Promise<TaskUpdate[]> => {
      const { data, error } = await supabase
        .from("task_updates")
        .select("*")
        .eq("task_id", taskId)
        .order("effective_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

export const recentUpdatesQuery = queryOptions({
  queryKey: ["task_updates", "recent"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("task_updates")
      .select("*, tasks(title, category)")
      .order("effective_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    return data ?? [];
  },
});

/** Keeps every task query live: changes from Instinct (MCP) or other tabs appear instantly. */
export function useTaskSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("instinct-task-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["tasks"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "task_updates" }, () => {
        qc.invalidateQueries({ queryKey: ["task_updates"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "mcp_credentials" }, () => {
        qc.invalidateQueries({ queryKey: ["mcp_credential"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}

export function useTasks() {
  return useQuery(tasksQuery);
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 60_000,
  });
}
