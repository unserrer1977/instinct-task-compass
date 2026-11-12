import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const connectionStatusQuery = queryOptions({
  queryKey: ["mcp_credential", "status"],
  refetchInterval: 30_000,
  queryFn: async () => {
    const [credentials, tasks, updates, attachments] = await Promise.all([
      supabase.from("mcp_credentials").select("id,name,created_at,last_used_at,revoked_at").order("created_at", { ascending: false }),
      supabase.from("tasks").select("id,title,created_at").eq("source", "instinct").order("created_at", { ascending: false }).limit(10),
      supabase.from("task_updates").select("id,task_id,message,created_at,tasks(title)").eq("source", "instinct").order("created_at", { ascending: false }).limit(10),
      supabase.from("task_attachments").select("id,task_id,file_name,created_at,tasks(title)").eq("source", "instinct").order("created_at", { ascending: false }).limit(10),
    ]);
    for (const result of [credentials, tasks, updates, attachments]) if (result.error) throw result.error;
    const transfers = [
      ...(tasks.data ?? []).map((task) => ({ id: `task-${task.id}`, taskId: task.id, title: task.title, detail: "Task received", receivedAt: task.created_at })),
      ...(updates.data ?? []).map((update) => ({ id: `update-${update.id}`, taskId: update.task_id, title: update.tasks?.title ?? "Task", detail: update.message, receivedAt: update.created_at })),
      ...(attachments.data ?? []).map((file) => ({ id: `file-${file.id}`, taskId: file.task_id, title: file.tasks?.title ?? "Task", detail: `Attachment: ${file.file_name}`, receivedAt: file.created_at })),
    ].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt)).slice(0, 10);
    return { credentials: credentials.data ?? [], transfers };
  },
});