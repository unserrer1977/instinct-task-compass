import { describe, expect, it } from "vitest";
import { normTs, TOOLS } from "@/lib/instinct-mcp";
import { wasImportedLater } from "@/lib/tasks";

describe("historical timestamps", () => {
  it("keeps the supplied moment, converting a timezone offset to UTC", () => {
    expect(normTs("2026-03-14T09:30:00+01:00")).toBe("2026-03-14T08:30:00.000Z");
  });
  it("keeps unknown dates unknown instead of inventing one", () => {
    expect(normTs(null)).toBeNull();
    expect(normTs(undefined)).toBeUndefined();
  });
  it("rejects timestamps in the future", () => {
    expect(() => normTs("2999-01-01T00:00:00Z")).toThrow(/future/);
  });
  it("requires timezone information", () => {
    const create = TOOLS.find((t) => t.name === "create_task")!;
    expect(create.input.safeParse({ title: "x", initiated_at: "2026-03-14T09:30:00" }).success).toBe(false);
    expect(create.input.safeParse({ title: "x", initiated_at: "2026-03-14T09:30:00Z" }).success).toBe(true);
  });
  it("flags tasks uploaded after they actually began", () => {
    expect(wasImportedLater({ source: "instinct", initiated_at: "2026-01-01T00:00:00Z", created_at: "2026-10-22T00:00:00Z" })).toBe(true);
    expect(wasImportedLater({ source: "instinct", initiated_at: null, created_at: "2026-10-22T00:00:00Z" })).toBe(true);
    expect(wasImportedLater({ source: "dashboard", initiated_at: "2026-10-22T00:00:00Z", created_at: "2026-10-22T00:00:00Z" })).toBe(false);
  });
});
