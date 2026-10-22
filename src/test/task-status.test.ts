import { describe, expect, it } from "vitest";
import { statusPatch, toggleTaskSelection, undoRecords } from "@/lib/task-status";
import type { Task } from "@/lib/tasks";

const task = { id: "one", status: "in_progress", progress: 42, completed_at: null, updated_at: "before" } as Task;
describe("fast task status actions", () => {
  it("Done immediately sets completed status, 100% progress and completion time", () => {
    expect(statusPatch(task, "completed", "now")).toEqual({ status: "completed", progress: 100, completed_at: "now", updated_at: "now" });
  });
  it("reopening a Done task clears completion time and resets completed progress", () => {
    expect(statusPatch({ ...task, status: "completed", progress: 100, completed_at: "done" }, "queued", "now")).toEqual({ status: "queued", progress: 0, completed_at: null, updated_at: "now" });
  });
  it("Select All adds every visible task without losing selection in other views", () => {
    expect([...toggleTaskSelection(new Set(["elsewhere"]), ["one", "two"], true)]).toEqual(["elsewhere", "one", "two"]);
  });
  it("individual deselection does not clear other tasks", () => {
    expect([...toggleTaskSelection(new Set(["one", "two"]), ["one"], false)]).toEqual(["two"]);
  });
  it("Undo restores each task's own original status and progress, guarded by its saved timestamp", () => {
    const second = { ...task, id: "two", status: "scheduled", progress: 0 };
    expect(undoRecords([task, second], [{ ...task, updated_at: "saved-1" }, { ...second, updated_at: "saved-2" }])).toEqual([
      { id: "one", status: "in_progress", progress: 42, completed_at: null, expected_updated_at: "saved-1" },
      { id: "two", status: "scheduled", progress: 0, completed_at: null, expected_updated_at: "saved-2" },
    ]);
  });
});