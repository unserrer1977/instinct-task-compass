import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Icon } from "@/components/app-shell";
import { useMcpCredential } from "@/hooks/use-mcp-credential";
import { useCurrentUser } from "@/hooks/use-tasks";
import { issueMcpCredential, revokeMcpCredentials } from "@/lib/credentials.functions";
import { connectionState, type ConnectionState } from "@/lib/mcp-token";
import { formatDateTime, relativeTime } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings · MCP Integration — Instinct Hub" },
      { name: "description", content: "Connect your Instinct AI assistant securely with an MCP key." },
      { property: "og:title", content: "Settings · MCP Integration — Instinct Hub" },
      { property: "og:description", content: "Connect your Instinct AI assistant securely with an MCP key." },
    ],
  }),
  component: Settings,
});

const STATE_UI: Record<ConnectionState, { label: string; body: string; dot: string; chip: string }> = {
  connected: { label: "Connected", body: "Instinct has called the server in the last 15 minutes.", dot: "bg-success", chip: "bg-success-soft/50 text-on-success-soft" },
  idle: { label: "Idle", body: "Key is active. Instinct hasn't called recently.", dot: "bg-info", chip: "bg-info-soft/60 text-on-info-soft" },
  awaiting: { label: "Awaiting first connection", body: "Key is active, but Instinct hasn't used it yet.", dot: "bg-info animate-pulse", chip: "bg-info-soft/60 text-on-info-soft" },
  not_configured: { label: "Not connected", body: "Generate a key to let Instinct connect.", dot: "bg-muted-foreground", chip: "bg-surface-high text-muted-foreground" },
};

type TestStep = { label: string; ok: boolean | null; detail?: string };

function useCopy() {
  return async (text: string, what = "Copied") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(what);
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  };
}

function Settings() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const copy = useCopy();
  const { data: user } = useCurrentUser();
  const { data: cred, isLoading } = useMcpCredential();
  const issue = useServerFn(issueMcpCredential);
  const revoke = useServerFn(revokeMcpCredentials);
  const [origin, setOrigin] = useState("");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [testToken, setTestToken] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [steps, setSteps] = useState<TestStep[] | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    setOrigin(window.location.origin);
    const i = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(i);
  }, []);

  const mcpUrl = origin ? `${origin}/api/public/mcp` : "";
  const state = connectionState(cred);
  const ui = STATE_UI[state];
  const keyForSnippets = freshToken ?? "<YOUR_INSTINCT_HUB_KEY>";

  async function generate() {
    if (cred && !confirm("Regenerate the key? The current key stops working immediately and Instinct must be updated with the new one.")) return;
    setBusy(true);
    try {
      const res = await issue();
      setFreshToken(res.token);
      setTestToken(res.token);
      setReveal(true);
      setSteps(null);
      qc.invalidateQueries({ queryKey: ["mcp_credential"] });
      toast.success("New key generated — copy it now, it won't be shown again");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't generate key");
    } finally {
      setBusy(false);
    }
  }

  async function doRevoke() {
    if (!confirm("Revoke the key? Instinct will be disconnected immediately.")) return;
    setBusy(true);
    try {
      await revoke();
      setFreshToken(null);
      setTestToken("");
      setSteps(null);
      qc.invalidateQueries({ queryKey: ["mcp_credential"] });
      toast.success("Key revoked — Instinct is disconnected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't revoke key");
    } finally {
      setBusy(false);
    }
  }

  async function rpc(method: string, token?: string, params: object = {}) {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(mcpUrl, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }) });
    const body = await r.json().catch(() => null);
    return { status: r.status, body };
  }

  async function testConnection() {
    setTesting(true);
    const out: TestStep[] = [];
    const push = (s: TestStep) => { out.push(s); setSteps([...out]); };
    try {
      const anon = await rpc("initialize");
      push({ label: "Server reachable & rejects unauthenticated calls", ok: anon.status === 401, detail: anon.status === 401 ? "401 Unauthorized as expected" : `Unexpected status ${anon.status}` });
      push({ label: "Active key on file", ok: !!cred, detail: cred ? `${cred.token_prefix}… created ${relativeTime(cred.created_at)}` : "Generate a key first" });
      const tok = testToken.trim();
      if (tok) {
        const init = await rpc("initialize", tok, { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "instinct-hub-test", version: "1" } });
        const initOk = init.status === 200 && !!init.body?.result?.serverInfo;
        push({ label: "Key authenticates (initialize)", ok: initOk, detail: initOk ? `Protocol ${init.body.result.protocolVersion}` : init.body?.error?.message ?? `Status ${init.status}` });
        if (initOk) {
          const tl = await rpc("tools/list", tok);
          const n = tl.body?.result?.tools?.length ?? 0;
          push({ label: "Task tools available", ok: n > 0, detail: `${n} tools exposed` });
          const sum = await rpc("tools/call", tok, { name: "get_task_summary", arguments: {} });
          const sc = sum.body?.result?.structuredContent;
          push({ label: "Reads your task ledger", ok: !!sc, detail: sc ? `${sc.total} task(s) visible to Instinct` : "Tool call failed" });
        }
      } else {
        push({ label: "End-to-end key check", ok: null, detail: "Paste your key below (or regenerate) to run a full authenticated test" });
      }
      const allOk = out.every((s) => s.ok !== false);
      allOk ? toast.success("Connection test passed") : toast.error("Connection test found a problem");
      qc.invalidateQueries({ queryKey: ["mcp_credential"] });
    } catch (e) {
      push({ label: "Network", ok: false, detail: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setTesting(false);
    }
  }

  const configJson = JSON.stringify(
    { mcpServers: { "instinct-hub": { type: "http", url: mcpUrl, headers: { Authorization: `Bearer ${keyForSnippets}` } } } },
    null,
    2,
  );
  const instructions = `You are connected to my Instinct Hub task ledger via MCP.
- Whenever I ask you to do something, first call list_tasks with a short query to check for an existing task; if none, call create_task (use external_ref with your own id for the request).
- As you work, call update_task with status "in_progress", progress (0-100), current_step and a short message.
- If you need my approval or input, set status "needs_review" and explain why in message.
- When finished, call complete_task with a clear result and any notes.
- At the start of a conversation, call get_task_summary to pick up where we left off.`;

  return (
    <div className="flex flex-col gap-4 py-3">
      <div>
        <p className="label-caps text-muted-foreground">Settings</p>
        <h1 className="text-[22px] font-semibold tracking-tight">MCP Integration</h1>
        <p className="text-[13px] text-muted-foreground">Let your Instinct assistant create, update and complete tasks in this dashboard.</p>
      </div>

      {/* Status */}
      <section className="card-surface relative overflow-hidden p-4">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary-soft/40 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft/60 text-primary"><Icon name="hub" /></span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold">Instinct</span>
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", ui.chip)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", ui.dot)} /> {isLoading ? "Checking…" : ui.label}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{ui.body}</p>
              {cred?.last_used_at && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">Last call {relativeTime(cred.last_used_at)}</p>}
            </div>
          </div>
        </div>
        <button onClick={testConnection} disabled={testing || !mcpUrl} className="relative mt-4 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-inverse text-[13px] font-semibold text-inverse-foreground disabled:opacity-60">
          <Icon name={testing ? "progress_activity" : "network_check"} className={cn("text-[18px]", testing && "animate-spin")} />
          {testing ? "Testing…" : "Test Connection"}
        </button>
        {steps && (
          <ul className="relative mt-3 flex flex-col gap-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px]">
                <Icon name={s.ok === null ? "radio_button_unchecked" : s.ok ? "check_circle" : "error"} fill={s.ok !== null} className={cn("text-[16px]", s.ok === null ? "text-muted-foreground" : s.ok ? "text-success" : "text-destructive")} />
                <span><b className="font-semibold">{s.label}</b>{s.detail && <span className="text-muted-foreground"> — {s.detail}</span>}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Server URL */}
      <section className="card-surface p-4">
        <h2 className="flex items-center gap-1.5 text-[14px] font-semibold"><Icon name="link" className="text-[18px] text-primary" /> MCP server URL</h2>
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-surface-low p-2 pl-3">
          <code className="flex-1 truncate font-mono text-[12px]">{mcpUrl || "…"}</code>
          <button onClick={() => copy(mcpUrl, "Server URL copied")} className="flex h-8 items-center gap-1 rounded-md bg-card px-2.5 text-[12px] font-semibold shadow-sm"><Icon name="content_copy" className="text-[16px]" /> Copy</button>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">Transport: Streamable HTTP · Auth: <span className="font-mono">Authorization: Bearer &lt;key&gt;</span>. After you publish, use the published address of this page instead.</p>
      </section>

      {/* Credential */}
      <section className="card-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold"><Icon name="key" className="text-[18px] text-primary" /> Authentication key</h2>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-success"><Icon name="shield" className="text-[14px]" /> Stored hashed</span>
        </div>

        {freshToken ? (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary-soft/30 p-3">
            <p className="text-[12px] font-semibold text-primary">Copy this key now — for your security it won't be shown again.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all rounded-md bg-card p-2 font-mono text-[12px]">{reveal ? freshToken : `${freshToken.slice(0, 11)}${"•".repeat(24)}`}</code>
              <div className="flex flex-col gap-1">
                <button onClick={() => setReveal(!reveal)} className="flex h-8 w-8 items-center justify-center rounded-md bg-card shadow-sm" aria-label={reveal ? "Hide key" : "Show key"}><Icon name={reveal ? "visibility_off" : "visibility"} className="text-[16px]" /></button>
                <button onClick={() => copy(freshToken, "Key copied")} className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-label="Copy key"><Icon name="content_copy" className="text-[16px]" /></button>
              </div>
            </div>
          </div>
        ) : cred ? (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-surface-low p-3">
            <div>
              <code className="font-mono text-[13px]">{cred.token_prefix}{"•".repeat(16)}</code>
              <p className="text-[11px] text-muted-foreground">Created {formatDateTime(cred.created_at)}{cred.last_used_at ? ` · last used ${relativeTime(cred.last_used_at)}` : " · never used"}</p>
            </div>
            <span className="rounded-full bg-success-soft/50 px-2 py-0.5 text-[11px] font-semibold text-on-success-soft">Active</span>
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-surface-low p-3 text-[13px] text-muted-foreground">No active key. Generate one to connect Instinct.</p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={generate} disabled={busy} className="flex h-10 items-center justify-center gap-1 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground disabled:opacity-60">
            <Icon name={cred ? "autorenew" : "add"} className="text-[18px]" /> {cred ? "Regenerate" : "Generate key"}
          </button>
          <button onClick={doRevoke} disabled={busy || !cred} className="flex h-10 items-center justify-center gap-1 rounded-lg bg-card text-[13px] font-semibold text-destructive shadow-sm disabled:opacity-40">
            <Icon name="block" className="text-[18px]" /> Revoke
          </button>
        </div>

        <label className="mt-3 block">
          <span className="text-[11px] font-semibold text-muted-foreground">Key for Test Connection (kept only in this browser tab)</span>
          <input type="password" value={testToken} onChange={(e) => setTestToken(e.target.value)} placeholder="inst_…" autoComplete="off" className="mt-1 h-10 w-full rounded-lg bg-surface-low px-3 font-mono text-[12px] outline-none focus:ring-2 focus:ring-ring" />
        </label>
      </section>

      {/* Instructions */}
      <section className="card-surface p-4">
        <h2 className="flex items-center gap-1.5 text-[14px] font-semibold"><Icon name="integration_instructions" className="text-[18px] text-primary" /> Connect Instinct</h2>
        <ol className="mt-3 flex flex-col gap-3 text-[13px]">
          <Step n={1}>Generate a key above and copy it.</Step>
          <Step n={2}>In Instinct, add a new MCP server (remote / HTTP). Name it <b>Instinct Hub</b> and paste the server URL.</Step>
          <Step n={3}>Add the header <span className="font-mono text-[12px]">Authorization: Bearer &lt;your key&gt;</span>. If Instinct uses a JSON config, paste this:</Step>
        </ol>
        <Snippet text={configJson} onCopy={() => copy(configJson, "Config copied")} />
        <ol start={4} className="mt-3 flex flex-col gap-3 text-[13px]">
          <Step n={4}>Add these standing instructions to Instinct so it logs every task automatically:</Step>
        </ol>
        <Snippet text={instructions} onCopy={() => copy(instructions, "Instructions copied")} />
        <ol className="mt-3 flex flex-col gap-3 text-[13px]">
          <Step n={5}>Press <b>Test Connection</b>. Status turns <b>Connected</b> as soon as Instinct makes its first call.</Step>
        </ol>
        <div className="mt-4 rounded-lg bg-surface-low p-3">
          <p className="text-[12px] font-semibold">Tools Instinct can use</p>
          <p className="mt-1 font-mono text-[11px] leading-5 text-muted-foreground">get_task_summary · list_tasks · get_task · create_task · update_task · add_task_note · complete_task · cancel_task · delete_task</p>
        </div>
      </section>

      <section className="card-surface flex items-center justify-between p-4">
        <div>
          <p className="text-[13px] font-semibold">Account</p>
          <p className="text-[12px] text-muted-foreground">{user?.email}</p>
        </div>
        <button
          onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}
          className="flex h-9 items-center gap-1 rounded-lg bg-surface-high px-3 text-[13px] font-semibold"
        >
          <Icon name="logout" className="text-[16px]" /> Sign out
        </button>
      </section>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{n}</span>
      <span>{children}</span>
    </li>
  );
}

function Snippet({ text, onCopy }: { text: string; onCopy: () => void }) {
  return (
    <div className="relative mt-2">
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-inverse p-3 pr-12 font-mono text-[11px] leading-5 text-inverse-foreground">{text}</pre>
      <button onClick={onCopy} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md bg-card/90 text-foreground" aria-label="Copy">
        <Icon name="content_copy" className="text-[16px]" />
      </button>
    </div>
  );
}
