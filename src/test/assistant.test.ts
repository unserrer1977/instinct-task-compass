import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { ownedTaskId, topicMessages } from "@/lib/assistant";

const messages: UIMessage[] = [
  { id: "work", role: "user", parts: [{ type: "text", text: "Work" }] },
  { id: "travel", role: "user", parts: [{ type: "text", text: "Travel" }] },
];
describe("Unified task assistant", () => {
  it("keeps all topics in one communication transcript", () => {
    expect(topicMessages(messages, "all", { work: "a", travel: "b" })).toEqual(messages);
  });
  it("separates a topic for viewing without changing the unified transcript", () => {
    expect(topicMessages(messages, "a", { work: "a", travel: "b" }).map((m) => m.id)).toEqual([
      "work",
    ]);
    expect(messages).toHaveLength(2);
  });
  it("rejects association with another user's task", () => {
    expect(() => ownedTaskId("other-task", new Set(["own-task"]))).toThrow("not accessible");
    expect(ownedTaskId("own-task", new Set(["own-task"]))).toBe("own-task");
  });
});
