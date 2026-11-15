import type { Task } from "@/lib/tasks";

export function isNewJobTask(task: Pick<Task, "category" | "title">) {
  const category = task.category.trim().toLowerCase().replace(/[_\s]+/g, "-");
  return ["job-start", "new-job", "new-role", "onboarding"].includes(category)
    || /\b(new job|new role|job start)\b/i.test(task.title);
}