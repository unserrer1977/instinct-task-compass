// Pure helpers for Instinct MCP credentials. Safe in browser, worker and tests.

export const TOKEN_PREFIX = "inst_";
export const CONNECTED_WINDOW_MS = 15 * 60 * 1000;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 32 random bytes → "inst_" + 43 base64url chars. */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return TOKEN_PREFIX + toBase64Url(bytes);
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Visible, non-secret identifier shown in the UI, e.g. "inst_AbC1…". */
export function tokenDisplayPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX.length + 6);
}

export type ConnectionState = "not_configured" | "awaiting" | "idle" | "connected";

export function connectionState(
  credential: { revoked_at: string | null; last_used_at: string | null } | null | undefined,
  now: number = Date.now(),
): ConnectionState {
  if (!credential || credential.revoked_at) return "not_configured";
  if (!credential.last_used_at) return "awaiting";
  const age = now - new Date(credential.last_used_at).getTime();
  return age <= CONNECTED_WINDOW_MS ? "connected" : "idle";
}
