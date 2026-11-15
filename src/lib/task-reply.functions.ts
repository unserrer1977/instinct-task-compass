import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const emailTaskReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ updateId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertReplyOwner, deliverTaskReply } = await import("@/lib/task-reply-email.server");
    assertReplyOwner(context.userId);
    const { data: update, error: updateError } = await context.supabase.from("task_updates")
      .select("*").eq("id", data.updateId).eq("user_id", context.userId).eq("source", "dashboard").eq("kind", "note").single();
    if (updateError || !update) throw new Error("This saved reply is not available for your account.");
    const { data: task, error: taskError } = await context.supabase.from("tasks")
      .select("*").eq("id", update.task_id).eq("user_id", context.userId).single();
    if (taskError || !task) throw new Error("This task is not available for your account.");
    return deliverTaskReply(task, update.message, update.occurred_at, update.id);
  });