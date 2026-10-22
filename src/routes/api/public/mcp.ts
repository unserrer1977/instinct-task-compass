import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, X-API-Key",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS, ...extra },
  });
}

function unauthorized(message: string) {
  return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message } }, 401, {
    "WWW-Authenticate": 'Bearer realm="instinct-hub", error="invalid_token"',
  });
}

export const Route = createFileRoute("/api/public/mcp")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () =>
        json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Use POST for MCP requests (SSE streams are not offered)." } }, 405, { Allow: "POST, OPTIONS" }),
      DELETE: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const header = request.headers.get("authorization") ?? "";
        const token = (header.match(/^Bearer\s+(.+)$/i)?.[1] ?? request.headers.get("x-api-key") ?? "").trim();
        if (!token) return unauthorized("Missing credential. Send Authorization: Bearer <your Instinct Hub key>.");
        if (!/^inst_[A-Za-z0-9_-]{30,80}$/.test(token)) return unauthorized("Invalid credential.");

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
        }

        const { hashToken } = await import("@/lib/mcp-token");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const hash = await hashToken(token);
        const { data: cred } = await supabaseAdmin
          .from("mcp_credentials")
          .select("id,user_id,revoked_at")
          .eq("token_hash", hash)
          .maybeSingle();
        if (!cred || cred.revoked_at) return unauthorized("Credential is invalid or has been revoked.");

        await supabaseAdmin.from("mcp_credentials").update({ last_used_at: new Date().toISOString() }).eq("id", cred.id);

        const { handleRpc } = await import("@/lib/instinct-mcp");
        const ctx = { db: supabaseAdmin, userId: cred.user_id };

        if (Array.isArray(body)) {
          if (body.length === 0) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Empty batch" } }, 400);
          const out = (await Promise.all(body.map((m) => handleRpc(ctx, m)))).filter(Boolean);
          return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
        }
        const res = await handleRpc(ctx, body as any);
        return res ? json(res) : new Response(null, { status: 202, headers: CORS });
      },
    },
  },
});
