import type { Task, TaskStatus } from "@/lib/tasks";

export function statusPatch(task: Task, status: TaskStatus, now: string): Partial<Task> {
  return {
    status,
    progress: status === "completed" ? 100 : task.status === "completed" ? 0 : task.progress,
    completed_at: status === "completed" ? task.completed_at ?? now : null,
    updated_at: now,
  };
}

export function toggleTaskSelection(selected: Set<string>, ids: string[], checked: boolean) {
  const next = new Set(selected);
  for (const id of ids) checked ? next.add(id) : next.delete(id);
  return next;
}

export function undoRecords(before: Task[], after: Task[]) {
  return before.map((task) => ({
    id: task.id,
    status: task.status,
    progress: task.progress,
    completed_at: task.completed_at,
    expected_updated_at: after.find((row) => row.id === task.id)?.updated_at ?? "",
  }));
}