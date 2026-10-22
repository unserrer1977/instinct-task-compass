import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateToken, hashToken, tokenDisplayPrefix } from "@/lib/mcp-token";

/** Revokes any active key and issues a new one. The plaintext is returned exactly once. */
export const issueMcpCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    const { error: revokeErr } = await supabase
      .from("mcp_credentials")
      .update({ revoked_at: now })
      .eq("user_id", userId)
      .is("revoked_at", null);
    if (revokeErr) throw new Error(revokeErr.message);

    const token = generateToken();
    const { data, error } = await supabase
      .from("mcp_credentials")
      .insert({ user_id: userId, name: "Instinct", token_hash: await hashToken(token), token_prefix: tokenDisplayPrefix(token) })
      .select("id,token_prefix,created_at")
      .single();
    if (error) throw new Error(error.message);
    return { token, credential: data };
  });

export const revokeMcpCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("mcp_credentials")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("revoked_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
