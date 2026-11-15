import type { Task } from "@/lib/tasks";

/** Summarise recorded state, without treating a source/platform badge as an assignee. */
export function taskFocus(task: Pick<Task, "status" | "source" | "current_step">) {
  const step = task.current_step?.trim();
  switch (task.status) {
    case "needs_review":
      return { status: "Needs you", waiting: task.source === "instinct" ? "Instinct is waiting on you" : "Waiting on you", dependency: step || "The required decision or information has not been recorded.", action: step || "Reply with your decision or ask what is needed before continuing." };
    case "in_progress":
      return { status: "Being done", waiting: "No waiting party recorded", dependency: "Work is in progress; no specific dependency is recorded.", action: step || "No next step recorded. Reply to request a progress update." };
    case "scheduled":
      return { status: "Scheduled", waiting: "Waiting for the scheduled start", dependency: "A start condition has not been recorded separately.", action: step || "Check the schedule or reply with any changes." };
    case "completed":
      return { status: "Done", waiting: "No outstanding wait", dependency: "The task is marked completed.", action: "No action needed. Review the result or reply with follow-up instructions." };
    case "cancelled":
      return { status: "Cancelled", waiting: "No outstanding wait", dependency: "The task is marked cancelled.", action: "No action needed unless you want to restart the task." };
    default:
      return { status: "Backlog", waiting: "Waiting for work to start", dependency: "No specific dependency or waiting party recorded.", action: step || "Reply with instructions or move the task to Being done when work starts." };
  }
}