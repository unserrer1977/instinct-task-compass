import { describe, expect, it } from "vitest";
import { connectionLabel, pendingInstinctTasks } from "@/lib/connection-status";
import type { Task } from "@/lib/tasks";

describe("connection status reporting", () => {
  const now = Date.parse("2026-11-12T21:38:00Z");
  it("reports recent contact without claiming a live agent connection", () => {
    expect(connectionLabel({ revoked_at: null, last_used_at: "2026-11-12T21:35:00Z" }, now)).toBe("Recently active");
    expect(connectionLabel({ revoked_at: null, last_used_at: "2026-11-12T20:00:00Z" }, now)).toBe("No recent contact");
  });
  it("distinguishes unused and revoked connections", () => {
    expect(connectionLabel({ revoked_at: null, last_used_at: null }, now)).toBe("Awaiting first contact");
    expect(connectionLabel({ revoked_at: "2026-11-12T21:37:00Z", last_used_at: "2026-11-12T21:35:00Z" }, now)).toBe("Revoked");
  });
  it("counts only unfinished tasks sent by Instinct as pending", () => {
    const tasks = ["queued", "scheduled", "needs_review", "in_progress", "completed", "cancelled"].map((status) => ({ id: status, status, source: "instinct" } as Task));
    tasks.push({ id: "user-task", source: "dashboard", status: "queued" } as Task);
    expect(pendingInstinctTasks(tasks).map((task) => task.id)).toEqual(["queued", "scheduled", "needs_review", "in_progress"]);
  });
});