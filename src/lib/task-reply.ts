import type { TablesInsert } from "@/integrations/supabase/types";

export function taskReplyRecord(taskId: string, userId: string, text: string, occurredAt: string): TablesInsert<"task_updates"> {
  const message = text.trim();
  if (!message) throw new Error("Write a reply first.");
  return { task_id: taskId, user_id: userId, message, kind: "note", source: "dashboard", occurred_at: occurredAt };
}