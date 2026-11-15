import { afterEach, describe, expect, it, vi } from "vitest";
import { assertReplyOwner, deliverTaskReply, replyEmail } from "@/lib/task-reply-email.server";
import { DEMO_TASKS } from "@/lib/demo-tasks";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Instinct reply delivery", () => {
  it("addresses the owner's inbox from the requested sender domain with matching task context", () => {
    const task = DEMO_TASKS[0];
    if (!task) throw new Error("Task fixture missing");
    const email = replyEmail(task, "Please resume using the revised dates.", "2026-11-15T17:28:00Z");
    expect(email.from).toBe("Task Compass <tasks@glenluna.com>");
    expect(email.to).toBe("inboxgyiubx@mail.instinct.com");
    expect(email.subject).toContain(task.id);
    expect(email.text).toContain("Please resume using the revised dates.");
    expect(email.text).toContain(task.title);
  });
  it("rejects other accounts before using the owner's inbox", () => {
    expect(() => assertReplyOwner("another-user")).toThrow();
  });
  it("reuses the saved reply identifier for email retry deduplication", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-gateway"); vi.stubEnv("RESEND_API_KEY", "test-connection");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "accepted-email" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const task = DEMO_TASKS[0]; if (!task) throw new Error("Task fixture missing");
    await deliverTaskReply(task, "Resume", null, "saved-note");
    await deliverTaskReply(task, "Resume", null, "saved-note");
    expect(fetchMock.mock.calls[0]?.[1].headers["Idempotency-Key"]).toBe("task-reply-saved-note");
    expect(fetchMock.mock.calls[1]?.[1].headers["Idempotency-Key"]).toBe("task-reply-saved-note");
  });
});