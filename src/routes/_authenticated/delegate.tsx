import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Icon } from "@/components/app-shell";
import { CATEGORIES } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/delegate")({
  head: () => ({
    meta: [
      { title: "New Delegation — Instinct Hub" },
      { name: "description", content: "Hand a new objective to Instinct with guardrails and a deadline." },
      { property: "og:title", content: "New Delegation — Instinct Hub" },
      { property: "og:description", content: "Hand a new objective to Instinct with guardrails and a deadline." },
    ],
  }),
  component: Delegate,
});

const AUTONOMY = [
  { id: "full_autonomy", label: "Full Autonomy", tag: "Zero-touch", body: "Instinct completes and executes end-to-end without stopping for human check-ins." },
  { id: "requires_approval", label: "Requires Approval", tag: "Recommended", body: "Instinct drafts and prepares everything, but pauses for your sign-off before financial transactions or outgoing comms." },
  { id: "advisory_only", label: "Advisory Only", tag: "Passive", body: "Instinct solely conducts synthesized research and reports structured findings." },
];

function Delegate() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState<string>("Work & Research");
  const [autonomy, setAutonomy] = useState("requires_approval");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);

  async function submit(asDraft: boolean) {
    const t = title.trim() || (prompt.trim().split("\n")[0] ?? "").slice(0, 120);
    if (!t) { toast.error("Describe the objective first"); return; }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setBusy(false); return; }
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: u.user.id,
        title: t,
        description: prompt.trim() || null,
        category,
        autonomy,
        priority,
        status: asDraft ? "scheduled" : "queued",
        deadline: deadline ? new Date(deadline).toISOString() : null,
        source: "dashboard",
      })
      .select("id")
      .single();
    if (!error && data) {
      await supabase.from("task_updates").insert({ task_id: data.id, user_id: u.user.id, message: asDraft ? "Saved as draft" : "Delegated from dashboard — waiting for Instinct to pick it up", kind: "created", source: "dashboard" });
    }
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["tasks"] });
    toast.success(asDraft ? "Draft saved" : "Task delegated to Instinct");
    navigate({ to: "/tasks/$id", params: { id: data.id } });
  }

  return (
    <div className="flex flex-col gap-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">New Objective</h1>
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Instinct picks this up on its next sync</p>
        </div>
        <Link to="/today" className="text-[13px] font-medium text-muted-foreground">Cancel</Link>
      </div>

      <section className="card-surface p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-primary"><Icon name="neurology" className="text-[18px]" /> Autonomous Direct Prompt</span>
          <span className="font-mono text-[11px] text-muted-foreground">{prompt.length}/1000</span>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="Short title (optional)" className="mt-3 h-10 w-full rounded-lg bg-surface-low px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-ring" />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, 1000))}
          rows={5}
          placeholder="e.g. Compare flights to Tokyo for Oct 12–20 under $1,200 and shortlist the best three."
          className="mt-2 w-full resize-none rounded-lg bg-surface-low p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">Workflow Domain</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button key={c.name} onClick={() => setCategory(c.name)} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors", category === c.name ? "bg-primary text-primary-foreground" : "bg-card shadow-sm")}>
              <span>{c.emoji}</span> {c.name}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">Instinct Autonomy Protocol</h2>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-success"><Icon name="shield" className="text-[14px]" /> Guardrails Active</span>
        </div>
        {AUTONOMY.map((a) => (
          <button key={a.id} onClick={() => setAutonomy(a.id)} className={cn("card-surface flex items-start gap-3 p-3.5 text-left transition-all", autonomy === a.id && "ring-2 ring-primary")}>
            <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", autonomy === a.id ? "border-primary" : "border-input")}>
              {autonomy === a.id && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
            </span>
            <span>
              <span className="flex items-center gap-2 text-[14px] font-semibold">{a.label}<span className="rounded-full bg-surface-high px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{a.tag}</span></span>
              <span className="mt-0.5 block text-[12px] text-muted-foreground">{a.body}</span>
            </span>
          </button>
        ))}
      </section>

      <section className="grid grid-cols-2 gap-2">
        <label className="card-surface flex flex-col gap-1 p-3">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><Icon name="schedule" className="text-[14px]" /> Deadline / Check-in</span>
          <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="bg-transparent text-[13px] font-medium outline-none" />
        </label>
        <label className="card-surface flex flex-col gap-1 p-3">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><Icon name="flag" className="text-[14px]" /> Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="bg-transparent text-[13px] font-medium outline-none">
            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select>
        </label>
      </section>

      <div className="rounded-xl bg-primary-soft/40 p-3 text-[12px] text-foreground">
        <span className="flex items-center gap-1 font-semibold text-primary"><Icon name="info" className="text-[16px]" /> Orchestration Tip</span>
        Tasks you ask Instinct for directly appear here automatically once it's connected in Settings.
      </div>

      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <button disabled={busy} onClick={() => submit(true)} className="h-12 rounded-xl bg-card text-[13px] font-semibold shadow-sm">Save as Draft</button>
        <button disabled={busy} onClick={() => submit(false)} className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-primary font-semibold text-primary-foreground shadow-md shadow-primary/25 disabled:opacity-60">
          <Icon name="bolt" fill /> Initiate Task Stream
        </button>
      </div>
    </div>
  );
}
