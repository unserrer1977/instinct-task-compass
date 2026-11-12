import { describe, expect, it } from "vitest";
import { taskReplyRecord } from "@/lib/task-reply";

describe("task card replies", () => {
  it("saves a reply against exactly the selected task as a user activity note", () => {
    expect(taskReplyRecord("selected-task", "current-user", "  Please use the revised document.\nThank you.  ", "2026-11-12T21:35:00.000Z")).toEqual({
      task_id: "selected-task", user_id: "current-user", message: "Please use the revised document.\nThank you.", kind: "note", source: "dashboard", occurred_at: "2026-11-12T21:35:00.000Z",
    });
  });
  it("rejects empty replies rather than storing blank activity", () => {
    expect(() => taskReplyRecord("selected-task", "current-user", " \n ", "2026-11-12T21:35:00.000Z")).toThrow("Write a reply first.");
  });
});