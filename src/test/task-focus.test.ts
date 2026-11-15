import { describe, expect, it } from "vitest";
import { taskFocus } from "@/lib/task-focus";

describe("task detail state", () => {
  it("uses the recorded decision for a task waiting on the user", () => {
    const focus = taskFocus({ status: "needs_review", source: "instinct", current_step: "Choose the venue" });
    expect(focus.waiting).toBe("Instinct is waiting on you");
    expect(focus.dependency).toBe("Choose the venue");
    expect(focus.action).toBe("Choose the venue");
  });
  it("does not invent a waiting party for active work", () => {
    expect(taskFocus({ status: "in_progress", source: "instinct", current_step: null }).waiting).toBe("No waiting party recorded");
  });
  it("does not present a stale step as outstanding after completion", () => {
    const focus = taskFocus({ status: "completed", source: "instinct", current_step: "Choose the venue" });
    expect(focus.waiting).toBe("No outstanding wait");
    expect(focus.action).not.toBe("Choose the venue");
  });
});