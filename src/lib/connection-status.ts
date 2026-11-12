import { connectionState } from "@/lib/mcp-token";
import type { Task } from "@/lib/tasks";

export function connectionLabel(credential: { revoked_at: string | null; last_used_at: string | null }, now: number) {
  if (credential.revoked_at) return "Revoked";
  const labels = { connected: "Recently active", idle: "No recent contact", awaiting: "Awaiting first contact", not_configured: "Not configured" };
  return labels[connectionState(credential, now)];
}

export function pendingInstinctTasks(tasks: Task[]) {
  return tasks.filter((task) => task.source === "instinct" && ["queued", "scheduled", "in_progress", "needs_review"].includes(task.status));
}