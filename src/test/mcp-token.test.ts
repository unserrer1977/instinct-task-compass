import { describe, expect, it } from "vitest";
import { connectionState, generateToken, hashToken } from "@/lib/mcp-token";

describe("MCP credentials", () => {
  it("generates unique inst_ keys with 256 bits of entropy", () => {
    const a = generateToken();
    expect(a).toMatch(/^inst_[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
  });

  it("stores only a deterministic SHA-256 hash, never the key", async () => {
    const h = await hashToken("inst_abc");
    expect(h).toHaveLength(64);
    expect(h).toBe(await hashToken("inst_abc"));
    expect(h).not.toContain("inst_");
  });

  it("revoked key shows as not connected", () => {
    expect(connectionState({ revoked_at: "2026-01-01T00:00:00Z", last_used_at: new Date().toISOString() })).toBe("not_configured");
  });

  it("is connected only if used within the last 15 minutes", () => {
    const now = Date.parse("2026-10-22T12:00:00Z");
    expect(connectionState({ revoked_at: null, last_used_at: "2026-10-22T11:50:00Z" }, now)).toBe("connected");
    expect(connectionState({ revoked_at: null, last_used_at: "2026-10-22T11:40:00Z" }, now)).toBe("idle");
    expect(connectionState({ revoked_at: null, last_used_at: null }, now)).toBe("awaiting");
  });
});
