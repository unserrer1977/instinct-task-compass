// Instinct MCP server: JSON-RPC 2.0 over Streamable HTTP (stateless, JSON responses).
// The caller is already authenticated; every query is scoped to `userId`.
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;
type Ctx = { db: Db; userId: string };

export const SERVER_INFO = { name: "instinct-hub", title: "Instinct Hub", version: "1.0.0" };
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const STATUS = z.enum(["queued", "scheduled", "in_progress", "needs_review", "completed", "cancelled"]);
const PRIORITY = z.enum(["low", "normal", "high", "urgent"]);

const TASK_FIELDS =
  "id,title,description,category,status,priority,progress,current_step,autonomy,deadline,notes,result,external_ref,source,initiated_at,started_at,last_activity_at,completed_at,timestamp_notes,created_at,updated_at,sort_initiated_at,sort_activity_at";

type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type TaskPatch = Database["public"]["Tables"]["tasks"]["Update"];

class ToolErr extends Error {}

// ---------- Historical timestamps ----------
const TS = z.string().datetime({ offset: true });
const TS_HELP =
  "ISO 8601 with timezone, e.g. 2026-03-14T09:30:00+01:00 or 2026-03-14T08:30:00Z. Pass null if unknown — never guess.";
const ts = (what: string) => TS.nullable().optional().describe(`${what} ${TS_HELP}`);
const TIME_KEYS = ["initiated_at", "started_at", "last_activity_at", "completed_at"] as const;
type TimeKey = (typeof TIME_KEYS)[number];

const TIMES = {
  initiated_at: ts("When the user originally asked for the task (its real creation time, not the upload time)."),
  started_at: ts("When work on the task actually started."),
  last_activity_at: ts("When the latest real activity on the task happened. Defaults to the latest supplied historical timestamp."),
  completed_at: ts("When the task was actually completed (requires status completed)."),
  timestamp_notes: z.string().max(1000).nullable().optional().describe("Notes about uncertain or approximate dates, e.g. 'start date approximate: week of 3 March'."),
};

/** Normalise to UTC ISO; undefined stays undefined (= not supplied), null stays null (= unknown). */
export function normTs(v: string | null | undefined, field = "timestamp"): string | null | undefined {
  if (v === undefined || v === null) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ToolErr(`${field}: not a valid ISO 8601 timestamp.`);
  if (d.getTime() > Date.now() + 10 * 60_000) throw new ToolErr(`${field}: ${v} is in the future; historical timestamps must be in the past.`);
  return d.toISOString();
}

function latest(...values: (string | null | undefined)[]): string | null {
  const v = values.filter((x): x is string => !!x).sort();
  return v.length ? v[v.length - 1]! : null;
}

const EVENT = z
  .object({
    occurred_at: TS.nullable().describe(`When this event actually happened. ${TS_HELP}`),
    message: z.string().min(1).max(2000),
    kind: z.enum(["created", "progress", "status", "note", "completed"]).optional(),
    status: STATUS.optional(),
    progress: z.number().int().min(0).max(100).optional(),
  })
  .strict();
type Event = z.infer<typeof EVENT>;

async function findTask(ctx: Ctx, id?: string, externalRef?: string) {
  if (!id && !externalRef) throw new ToolErr("Provide either id or external_ref.");
  let q = ctx.db.from("tasks").select(TASK_FIELDS).eq("user_id", ctx.userId);
  q = id ? q.eq("id", id) : q.eq("external_ref", externalRef!);
  const { data, error } = await q.maybeSingle();
  if (error) throw new ToolErr(error.message);
  if (!data) throw new ToolErr("Task not found.");
  return data as TaskRow;
}

async function logUpdate(
  ctx: Ctx,
  taskId: string,
  message: string,
  extra: { kind?: string; status?: string | null; progress?: number | null; occurred_at?: string | null } = {},
) {
  await ctx.db.from("task_updates").insert({
    task_id: taskId,
    user_id: ctx.userId,
    message,
    kind: extra.kind ?? "progress",
    status: extra.status ?? null,
    progress: extra.progress ?? null,
    occurred_at: extra.occurred_at === undefined ? new Date().toISOString() : extra.occurred_at,
    source: "instinct",
  });
}

/** Adds historical events, skipping ones already recorded (same moment + same message). */
async function importEvents(ctx: Ctx, taskId: string, events: Event[]) {
  if (!events.length) return 0;
  const { data: existing } = await ctx.db.from("task_updates").select("occurred_at,message").eq("task_id", taskId);
  const seen = new Set((existing ?? []).map((e) => `${e.occurred_at ? new Date(e.occurred_at).toISOString() : ""}|${e.message}`));
  const rows = [];
  for (const e of events) {
    const at = normTs(e.occurred_at, "history.occurred_at") ?? null;
    const key = `${at ?? ""}|${e.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ task_id: taskId, user_id: ctx.userId, message: e.message, kind: e.kind ?? "progress", status: e.status ?? null, progress: e.progress ?? null, occurred_at: at, source: "instinct" });
  }
  if (rows.length) {
    const { error } = await ctx.db.from("task_updates").insert(rows);
    if (error) throw new ToolErr(error.message);
  }
  return rows.length;
}

const ref = {
  id: z.string().uuid().optional().describe("Task id (UUID)."),
  external_ref: z.string().max(200).optional().describe("Your own stable reference for the task, if you set one at creation."),
};

const CONTENT = {
  description: z.string().max(5000).optional().describe("The user's instruction in full."),
  category: z.string().max(60).optional().describe("e.g. Work & Research, Travel, Finance, Home & Errands, Personal."),
  priority: PRIORITY.optional(),
  deadline: z.string().datetime({ offset: true }).nullable().optional().describe("ISO 8601 deadline."),
  notes: z.string().max(5000).optional(),
  result: z.string().max(10000).optional(),
};

const hasHistorical = (a: any) =>
  TIME_KEYS.some((k) => a[k] !== undefined) || a.timestamp_notes !== undefined || a.occurred_at !== undefined || (a.history?.length ?? 0) > 0;

async function createTaskRecord(ctx: Ctx, a: any): Promise<TaskRow> {
  const historical = hasHistorical(a);
  const now = new Date().toISOString();
  const t: Partial<Record<TimeKey, string | null | undefined>> = {};
  for (const k of TIME_KEYS) t[k] = normTs(a[k], k);
  const status = a.status ?? (t.completed_at ? "completed" : "queued");
  if (t.completed_at && status !== "completed") throw new ToolErr("completed_at requires status completed.");
  const history: Event[] = a.history ?? [];
  const initiated = historical ? (t.initiated_at ?? null) : now;
  const started = historical ? (t.started_at ?? null) : status === "in_progress" ? now : null;
  const completed = status === "completed" ? (historical ? (t.completed_at ?? null) : now) : null;
  const lastActivity =
    t.last_activity_at !== undefined
      ? t.last_activity_at
      : historical
        ? latest(initiated, started, completed, ...history.map((e) => normTs(e.occurred_at)))
        : now;
  const { data, error } = await ctx.db
    .from("tasks")
    .insert({
      user_id: ctx.userId,
      title: a.title,
      description: a.description ?? null,
      category: a.category ?? "Work & Research",
      priority: a.priority ?? "normal",
      status,
      progress: a.progress ?? (status === "completed" ? 100 : 0),
      current_step: a.current_step ?? null,
      deadline: a.deadline ?? null,
      notes: a.notes ?? null,
      result: a.result ?? null,
      external_ref: a.external_ref ?? null,
      initiated_at: initiated,
      started_at: started,
      completed_at: completed,
      last_activity_at: lastActivity,
      timestamp_notes: a.timestamp_notes ?? null,
      source: "instinct",
    })
    .select(TASK_FIELDS)
    .single();
  if (error) throw new ToolErr(error.message);
  const row = data as TaskRow;
  if (!history.some((e) => e.kind === "created")) {
    await logUpdate(ctx, row.id, "Task received from Instinct", { kind: "created", status: row.status, occurred_at: initiated });
  }
  if (historical && status === "completed" && !history.some((e) => e.kind === "completed")) {
    await logUpdate(ctx, row.id, row.result ? `Completed: ${row.result.slice(0, 300)}` : "Task completed", { kind: "completed", status: "completed", progress: 100, occurred_at: completed });
  }
  await importEvents(ctx, row.id, history);
  return row;
}

/** Applies content + timestamp changes, guaranteeing supplied historical values are not replaced by "now". */
async function updateTaskRecord(ctx: Ctx, task: TaskRow, a: any): Promise<{ task: TaskRow; events_added: number }> {
  const historical = hasHistorical(a);
  const patch: TaskPatch = {};
  for (const k of ["status", "progress", "current_step", "title", "description", "category", "priority", "deadline", "notes", "result", "timestamp_notes"] as const) {
    if (a[k] !== undefined) (patch as any)[k] = a[k];
  }
  if (a.set_external_ref !== undefined) patch.external_ref = a.set_external_ref;
  const intended: Partial<Record<TimeKey, string | null>> = {};
  for (const k of TIME_KEYS) {
    const v = normTs(a[k], k);
    if (v !== undefined) intended[k] = v;
  }
  const finalStatus = a.status ?? task.status;
  if (intended.completed_at && finalStatus !== "completed") throw new ToolErr("completed_at requires status completed.");
  const history: Event[] = a.history ?? [];
  const occurred = a.occurred_at !== undefined ? normTs(a.occurred_at, "occurred_at") : undefined;
  if (historical) {
    if (a.status === "completed" && task.status !== "completed" && intended.completed_at === undefined) intended.completed_at = occurred ?? null;
    if (a.status === "in_progress" && task.status !== "in_progress" && intended.started_at === undefined && !task.started_at) intended.started_at = occurred ?? null;
    if (intended.last_activity_at === undefined) {
      intended.last_activity_at = latest(
        task.last_activity_at, intended.initiated_at, intended.started_at, intended.completed_at, occurred,
        ...history.map((e) => normTs(e.occurred_at)),
      );
    }
  }
  Object.assign(patch, intended);
  if (Object.keys(patch).length === 0 && !a.message && !history.length) throw new ToolErr("Nothing to update.");
  let updated = task;
  if (Object.keys(patch).length) {
    const { data, error } = await ctx.db.from("tasks").update(patch).eq("id", task.id).eq("user_id", ctx.userId).select(TASK_FIELDS).single();
    if (error) throw new ToolErr(error.message);
    updated = data as TaskRow;
    // The database fills live transitions with "now"; restore any historical value (including unknown) that was overridden.
    const fix: TaskPatch = {};
    for (const k of TIME_KEYS) {
      if (!(k in intended)) continue;
      const got = updated[k] ? new Date(updated[k] as string).toISOString() : null;
      if (got !== intended[k]) (fix as any)[k] = intended[k];
    }
    if (Object.keys(fix).length) {
      const { data: fixed, error: fixErr } = await ctx.db.from("tasks").update(fix).eq("id", task.id).eq("user_id", ctx.userId).select(TASK_FIELDS).single();
      if (fixErr) throw new ToolErr(fixErr.message);
      updated = fixed as TaskRow;
    }
  }
  const statusChanged = a.status && a.status !== task.status;
  if (a.message || statusChanged) {
    await logUpdate(ctx, task.id, a.message ?? `Status changed to ${a.status}`, {
      kind: a.status === "completed" && statusChanged ? "completed" : statusChanged ? "status" : "progress",
      status: a.status ?? null,
      progress: a.progress ?? null,
      occurred_at: occurred !== undefined ? occurred : historical ? null : new Date().toISOString(),
    });
  }
  if (intended.initiated_at !== undefined) {
    await ctx.db.from("task_updates").update({ occurred_at: intended.initiated_at }).eq("task_id", task.id).eq("user_id", ctx.userId).eq("kind", "created").eq("source", "instinct");
  }
  const events_added = await importEvents(ctx, task.id, history);
  return { task: updated, events_added };
}

type ToolDef = {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject<z.ZodRawShape>;
  annotations: Record<string, boolean>;
  run: (ctx: Ctx, args: any) => Promise<unknown>;
};

const IMPORT_ITEM = z
  .object({
    ...ref,
    title: z.string().min(1).max(300),
    ...CONTENT,
    status: STATUS.optional(),
    progress: z.number().int().min(0).max(100).optional(),
    current_step: z.string().max(300).optional(),
    ...TIMES,
    history: z.array(EVENT).max(200).optional().describe("Historical progress/status events with their real times."),
  })
  .strict();

const SORT_COL: Record<string, string> = {
  activity: "sort_activity_at",
  initiated: "sort_initiated_at",
  completed: "completed_at",
  imported: "created_at",
};

export const TOOLS: ToolDef[] = [
  {
    name: "get_task_summary",
    title: "Get task summary",
    description: "Counts of the user's tasks by status plus the most recently active tasks (by real activity date). Call at the start of a session for context.",
    input: z.object({}).strict(),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (ctx) => {
      const { data, error } = await ctx.db.from("tasks").select("status,initiated_at").eq("user_id", ctx.userId);
      if (error) throw new ToolErr(error.message);
      const counts: Record<string, number> = {};
      let missing = 0;
      for (const r of data ?? []) {
        counts[r.status] = (counts[r.status] ?? 0) + 1;
        if (!r.initiated_at) missing++;
      }
      const { data: recent } = await ctx.db
        .from("tasks")
        .select("id,title,status,progress,initiated_at,last_activity_at,completed_at,created_at")
        .eq("user_id", ctx.userId)
        .order("sort_activity_at", { ascending: false })
        .limit(5);
      return { counts, total: data?.length ?? 0, missing_original_date: missing, recent: recent ?? [] };
    },
  },
  {
    name: "list_tasks",
    title: "List tasks",
    description:
      "List or search the user's tasks, sorted by real (historical) dates. Use before creating a task to avoid duplicates. initiated_at/started_at/last_activity_at/completed_at are when things actually happened; created_at is when the record was uploaded.",
    input: z
      .object({
        status: z.array(STATUS).optional().describe("Only these statuses."),
        query: z.string().max(200).optional().describe("Case-insensitive text search in title and description."),
        include_closed: z.boolean().optional().describe("Include completed/cancelled tasks (default false)."),
        missing_original_date: z.boolean().optional().describe("Only tasks whose original initiation date is unknown (includes closed tasks)."),
        initiated_after: TS.optional().describe("Only tasks initiated at or after this time."),
        initiated_before: TS.optional().describe("Only tasks initiated before this time."),
        sort: z.enum(["activity", "initiated", "completed", "imported"]).optional().describe("Sort newest first by: real last activity (default), real initiation date, completion date, or upload date."),
        limit: z.number().int().min(1).max(100).optional().describe("Max results, default 25."),
        offset: z.number().int().min(0).optional().describe("Skip this many results (pagination)."),
      })
      .strict(),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      let q = ctx.db.from("tasks").select(TASK_FIELDS).eq("user_id", ctx.userId);
      if (a.status?.length) q = q.in("status", a.status);
      else if (!a.include_closed && !a.missing_original_date) q = q.not("status", "in", "(completed,cancelled)");
      if (a.missing_original_date) q = q.is("initiated_at", null);
      if (a.initiated_after) q = q.gte("initiated_at", normTs(a.initiated_after)!);
      if (a.initiated_before) q = q.lt("initiated_at", new Date(a.initiated_before).toISOString());
      if (a.query) {
        const s = String(a.query).replace(/[%,()]/g, " ").trim();
        if (s) q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
      }
      const limit = a.limit ?? 25;
      const offset = a.offset ?? 0;
      const { data, error } = await q
        .order(SORT_COL[a.sort ?? "activity"] ?? "sort_activity_at", { ascending: false, nullsFirst: false })
        .order("id")
        .range(offset, offset + limit - 1);
      if (error) throw new ToolErr(error.message);
      return { tasks: data ?? [], count: data?.length ?? 0, offset };
    },
  },
  {
    name: "get_task",
    title: "Get task",
    description: "Get one task with its full progress history in real chronological order (occurred_at = when it happened, created_at = when recorded).",
    input: z.object(ref).strict(),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      const task = await findTask(ctx, a.id, a.external_ref);
      const { data: updates } = await ctx.db
        .from("task_updates")
        .select("message,kind,status,progress,source,occurred_at,created_at")
        .eq("task_id", task.id)
        .order("effective_at", { ascending: true });
      const { data: attachments } = await ctx.db
        .from("task_attachments")
        .select("id,file_name,mime_type,size_bytes,description,source,occurred_at,created_at")
        .eq("task_id", task.id)
        .eq("user_id", ctx.userId)
        .order("created_at", { ascending: true });
      return { task, updates: updates ?? [], attachments: attachments ?? [] };
    },
  },
  {
    name: "create_task",
    title: "Create task",
    description:
      "Record a task the user asked Instinct to do. For live tasks omit timestamps (now is used). For historical tasks pass the real initiated_at/started_at/completed_at/last_activity_at and optional history; unknown dates must be null. Deduplicates by external_ref, or by title (open tasks; any status when historical) — returns duplicate=true instead of creating.",
    input: z
      .object({
        title: z.string().min(1).max(300).describe("Short task title."),
        ...CONTENT,
        status: STATUS.optional().describe("Initial status, default queued (completed if completed_at is given)."),
        progress: z.number().int().min(0).max(100).optional(),
        current_step: z.string().max(300).optional(),
        external_ref: z.string().max(200).optional().describe("Stable id from Instinct for idempotent creation."),
        ...TIMES,
        history: z.array(EVENT).max(200).optional().describe("Historical progress/status events with their real times."),
        allow_duplicate: z.boolean().optional().describe("Skip duplicate detection (default false)."),
      })
      .strict(),
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      if (!a.allow_duplicate) {
        if (a.external_ref) {
          const { data } = await ctx.db.from("tasks").select(TASK_FIELDS).eq("user_id", ctx.userId).eq("external_ref", a.external_ref).maybeSingle();
          if (data) return { task: data, duplicate: true, hint: "Use update_task or import_tasks to change its timestamps." };
        }
        let same = ctx.db.from("tasks").select(TASK_FIELDS).eq("user_id", ctx.userId).ilike("title", a.title.replace(/[%_\\]/g, "\\$&"));
        if (!hasHistorical(a)) same = same.not("status", "in", "(completed,cancelled)");
        const { data: hits } = await same.limit(1);
        if (hits?.length) return { task: hits[0], duplicate: true, hint: "Use update_task or import_tasks to change its timestamps." };
      }
      return { task: await createTaskRecord(ctx, a), duplicate: false };
    },
  },
  {
    name: "import_tasks",
    title: "Import historical tasks",
    description:
      "Bulk create-or-update up to 50 historical tasks with their real dates, without duplicates. Each item matches an existing task by id, then external_ref, then exact title (any status); matched tasks get their fields/timestamps updated, otherwise a new task is created. History events are de-duplicated by occurred_at + message. Use this to backfill original dates on previously uploaded tasks.",
    input: z.object({ tasks: z.array(IMPORT_ITEM).min(1).max(50) }).strict(),
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      const results: ({ action: string } & Record<string, unknown>)[] = [];
      for (const [i, item] of (a.tasks as z.infer<typeof IMPORT_ITEM>[]).entries()) {
        try {
          let match: TaskRow | null = null;
          if (item.id) match = await findTask(ctx, item.id);
          else {
            if (item.external_ref) {
              const { data } = await ctx.db.from("tasks").select(TASK_FIELDS).eq("user_id", ctx.userId).eq("external_ref", item.external_ref).maybeSingle();
              match = (data as TaskRow) ?? null;
            }
            if (!match) {
              const { data } = await ctx.db.from("tasks").select(TASK_FIELDS).eq("user_id", ctx.userId).ilike("title", item.title.replace(/[%_\\]/g, "\\$&")).limit(2);
              if ((data?.length ?? 0) > 1) throw new ToolErr("Several tasks share this title; pass the task id.");
              match = (data?.[0] as TaskRow) ?? null;
            }
          }
          if (match) {
            const { id: _id, external_ref, title, ...rest } = item;
            const upd: any = { ...rest };
            if (title !== match.title) upd.title = title;
            if (external_ref && external_ref !== match.external_ref) upd.set_external_ref = external_ref;
            const out = await updateTaskRecord(ctx, match, upd);
            results.push({ index: i, action: "updated", id: out.task.id, title: out.task.title, events_added: out.events_added });
          } else {
            const row = await createTaskRecord(ctx, item);
            results.push({ index: i, action: "created", id: row.id, title: row.title });
          }
        } catch (e) {
          if (!(e instanceof ToolErr)) console.error("[mcp] import item failure", e);
          results.push({ index: i, action: "error", title: item.title, error: e instanceof ToolErr ? e.message : "Internal error" });
        }
      }
      const tally = (k: string) => results.filter((r) => r.action === k).length;
      return { created: tally("created"), updated: tally("updated"), errors: tally("error"), results };
    },
  },
  {
    name: "update_task",
    title: "Update task",
    description:
      "Update a task's status, progress, notes, other fields or its historical timestamps (initiated_at, started_at, last_activity_at, completed_at). Include `message` to log an update; set `occurred_at` when that update happened in the past. Supplied timestamps are stored exactly and never replaced with the current time.",
    input: z
      .object({
        ...ref,
        status: STATUS.optional(),
        progress: z.number().int().min(0).max(100).optional().describe("Percent complete."),
        current_step: z.string().max(300).optional().describe("What Instinct is doing right now."),
        message: z.string().max(2000).optional().describe("Progress note to append to the history."),
        occurred_at: TS.nullable().optional().describe(`When this update/status change actually happened (default now). ${TS_HELP}`),
        title: z.string().min(1).max(300).optional(),
        ...CONTENT,
        ...TIMES,
        history: z.array(EVENT).max(200).optional().describe("Historical events to add (de-duplicated)."),
        set_external_ref: z.string().max(200).optional().describe("Attach your stable reference to this task for future matching."),
      })
      .strict(),
    annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
    run: async (ctx, a) => {
      const task = await findTask(ctx, a.id, a.external_ref);
      return await updateTaskRecord(ctx, task, a);
    },
  },
  {
    name: "complete_task",
    title: "Complete task",
    description: "Mark a task as completed and record the outcome. Pass completed_at for a task that was finished in the past.",
    input: z
      .object({
        ...ref,
        result: z.string().max(10000).optional().describe("What was achieved / the deliverable."),
        notes: z.string().max(5000).optional(),
        completed_at: ts("When it was actually completed (default now)."),
      })
      .strict(),
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      const task = await findTask(ctx, a.id, a.external_ref);
      const wasDone = task.status === "completed";
      const out = await updateTaskRecord(ctx, task, {
        status: "completed",
        progress: 100,
        current_step: null,
        result: a.result,
        notes: a.notes,
        ...(a.completed_at !== undefined ? { completed_at: a.completed_at, occurred_at: a.completed_at } : {}),
        message: wasDone ? undefined : a.result ? `Completed: ${a.result.slice(0, 300)}` : "Task completed",
      });
      return { task: out.task };
    },
  },
  {
    name: "add_task_note",
    title: "Add progress note",
    description: "Append a progress note to a task's history without changing other fields. Set occurred_at for past events.",
    input: z.object({ ...ref, message: z.string().min(1).max(2000), occurred_at: TS.nullable().optional().describe(`When it happened (default now). ${TS_HELP}`) }).strict(),
    annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
    run: async (ctx, a) => {
      const task = await findTask(ctx, a.id, a.external_ref);
      const at = a.occurred_at === undefined ? new Date().toISOString() : normTs(a.occurred_at, "occurred_at")!;
      await logUpdate(ctx, task.id, a.message, { kind: "note", occurred_at: at ?? null });
      const next = latest(task.last_activity_at, at);
      await ctx.db.from("tasks").update({ last_activity_at: next }).eq("id", task.id).eq("user_id", ctx.userId);
      return { ok: true, task_id: task.id };
    },
  },
  {
    name: "cancel_task",
    title: "Cancel task",
    description: "Cancel a task that should no longer be worked on. Set occurred_at for a past cancellation.",
    input: z.object({ ...ref, reason: z.string().max(2000).optional(), occurred_at: TS.nullable().optional().describe(`When it was cancelled (default now). ${TS_HELP}`) }).strict(),
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      const task = await findTask(ctx, a.id, a.external_ref);
      const out = await updateTaskRecord(ctx, task, {
        status: "cancelled",
        current_step: null,
        ...(a.occurred_at !== undefined ? { occurred_at: a.occurred_at } : {}),
        message: a.reason ? `Cancelled: ${a.reason}` : "Task cancelled",
      });
      return { task: out.task };
    },
  },
  {
    name: "delete_task",
    title: "Delete task",
    description: "Permanently delete a task and its history. Only use when the user explicitly asks.",
    input: z.object(ref).strict(),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      const task = await findTask(ctx, a.id, a.external_ref);
      const { error } = await ctx.db.from("tasks").delete().eq("id", task.id).eq("user_id", ctx.userId);
      if (error) throw new ToolErr(error.message);
      return { deleted: true, id: task.id };
    },
  },
  {
    name: "upload_attachment",
    title: "Upload task attachment",
    description:
      "Attach a file (document, image, etc.) to an existing task, including historical tasks — find the task by id or external_ref; this never creates a task. Send content_base64 or a public source_url. Max 20 MB. Identical files already on the task are not duplicated (returns duplicate=true).",
    input: z
      .object({
        ...ref,
        file_name: z.string().min(1).max(255).describe("Original file name including extension."),
        mime_type: z.string().max(150).optional().describe("MIME type, e.g. application/pdf. Guessed from the name if omitted."),
        content_base64: z.string().optional().describe("File content, base64 encoded."),
        source_url: z.string().url().optional().describe("Public https URL to fetch the file from instead of content_base64."),
        description: z.string().max(1000).optional(),
        occurred_at: TS.nullable().optional().describe(`When the file was originally produced/attached. ${TS_HELP}`),
      })
      .strict(),
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    run: async (ctx, a) => {
      const task = await findTask(ctx, a.id, a.external_ref);
      if (!!a.content_base64 === !!a.source_url) throw new ToolErr("Provide exactly one of content_base64 or source_url.");
      let bytes: Uint8Array<ArrayBuffer>;
      let mime = a.mime_type as string | undefined;
      if (a.content_base64) {
        try {
          const bin = atob(String(a.content_base64).replace(/^data:[^,]*,/, "").replace(/\s/g, ""));
          bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        } catch {
          throw new ToolErr("content_base64 is not valid base64.");
        }
      } else {
        if (!/^https:\/\//i.test(a.source_url)) throw new ToolErr("source_url must be https.");
        const res = await fetch(a.source_url).catch(() => null);
        if (!res || !res.ok) throw new ToolErr(`Could not download source_url (${res?.status ?? "network error"}).`);
        bytes = new Uint8Array(await res.arrayBuffer());
        mime ??= res.headers.get("content-type")?.split(";")[0] ?? undefined;
      }
      if (bytes.byteLength === 0) throw new ToolErr("File is empty.");
      if (bytes.byteLength > MAX_ATTACHMENT) throw new ToolErr("File exceeds the 20 MB limit.");
      mime = mime || guessMime(a.file_name);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const sha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
      const { data: existing } = await ctx.db
        .from("task_attachments")
        .select(ATT_FIELDS)
        .eq("task_id", task.id)
        .eq("user_id", ctx.userId)
        .eq("sha256", sha256)
        .maybeSingle();
      if (existing) return { duplicate: true, attachment: existing };
      const safe = a.file_name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120) || "file";
      const path = `${ctx.userId}/${task.id}/${crypto.randomUUID()}-${safe}`;
      const up = await ctx.db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
      if (up.error) throw new ToolErr(`Upload failed: ${up.error.message}`);
      const { data, error } = await ctx.db
        .from("task_attachments")
        .insert({
          task_id: task.id,
          user_id: ctx.userId,
          file_name: a.file_name,
          mime_type: mime,
          size_bytes: bytes.byteLength,
          storage_path: path,
          sha256,
          description: a.description ?? null,
          source: "instinct",
          occurred_at: normTs(a.occurred_at, "occurred_at") ?? null,
        })
        .select(ATT_FIELDS)
        .single();
      if (error) {
        await ctx.db.storage.from(BUCKET).remove([path]);
        throw new ToolErr(error.message);
      }
      return { duplicate: false, attachment: data };
    },
  },
  {
    name: "list_attachments",
    title: "List task attachments",
    description: "List attachments on one task (id or external_ref), or across all tasks when neither is given.",
    input: z
      .object({
        id: z.string().uuid().optional(),
        external_ref: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .strict(),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      let q = ctx.db.from("task_attachments").select(ATT_FIELDS).eq("user_id", ctx.userId);
      if (a.id || a.external_ref) q = q.eq("task_id", (await findTask(ctx, a.id, a.external_ref)).id);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(a.limit ?? 50);
      if (error) throw new ToolErr(error.message);
      return { attachments: data ?? [], count: data?.length ?? 0 };
    },
  },
  {
    name: "get_attachment",
    title: "Get task attachment",
    description: "Get an attachment's details and a temporary (1 hour) download link. Set include_content to also receive base64 content for files up to 2 MB.",
    input: z.object({ attachment_id: z.string().uuid(), include_content: z.boolean().optional() }).strict(),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      const att = await findAttachment(ctx, a.attachment_id);
      const { data: signed } = await ctx.db.storage.from(BUCKET).createSignedUrl(att.storage_path, 3600, { download: att.file_name });
      const out: Record<string, unknown> = { attachment: att, download_url: signed?.signedUrl ?? null, expires_in: 3600 };
      if (a.include_content) {
        if (att.size_bytes > 2 * 1024 * 1024) throw new ToolErr("File is larger than 2 MB; use download_url instead.");
        const { data: blob, error } = await ctx.db.storage.from(BUCKET).download(att.storage_path);
        if (error || !blob) throw new ToolErr("Could not read file.");
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        out["content_base64"] = btoa(bin);
      }
      return out;
    },
  },
  {
    name: "delete_attachment",
    title: "Delete task attachment",
    description: "Permanently remove an attachment from its task. Only when the user asks.",
    input: z.object({ attachment_id: z.string().uuid() }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      const att = await findAttachment(ctx, a.attachment_id);
      await ctx.db.storage.from(BUCKET).remove([att.storage_path]);
      const { error } = await ctx.db.from("task_attachments").delete().eq("id", att.id).eq("user_id", ctx.userId);
      if (error) throw new ToolErr(error.message);
      return { deleted: true, id: att.id };
    },
  },
];

// ---------- Attachments ----------
const BUCKET = "task-attachments";
const MAX_ATTACHMENT = 20 * 1024 * 1024;
const ATT_FIELDS = "id,task_id,file_name,mime_type,size_bytes,storage_path,sha256,description,source,occurred_at,created_at";
const MIME: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json", html: "text/html",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip", mp3: "audio/mpeg", mp4: "video/mp4", mov: "video/quicktime",
};
export function guessMime(name: string) {
  return MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}
async function findAttachment(ctx: Ctx, id: string) {
  const { data, error } = await ctx.db.from("task_attachments").select(ATT_FIELDS).eq("id", id).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new ToolErr(error.message);
  if (!data) throw new ToolErr("Attachment not found.");
  return data;
}

function toSchema(raw: z.ZodTypeAny): { schema: any; optional: boolean } {
  let t = raw;
  let optional = false;
  let nullable = false;
  while (t instanceof z.ZodOptional || t instanceof z.ZodNullable || t instanceof z.ZodDefault) {
    if (t instanceof z.ZodNullable) nullable = true;
    else optional = true;
    t = (t as any)._def.innerType;
  }
  const desc = raw.description ?? t.description;
  let s: any = {};
  if (t instanceof z.ZodString) {
    s = { type: "string" };
    for (const c of (t as any)._def.checks ?? []) {
      if (c.kind === "uuid") s.format = "uuid";
      if (c.kind === "datetime") s.format = "date-time";
      if (c.kind === "max") s.maxLength = c.value;
      if (c.kind === "min") s.minLength = c.value;
    }
  } else if (t instanceof z.ZodNumber) {
    s = { type: (t as any)._def.checks?.some((c: any) => c.kind === "int") ? "integer" : "number" };
    for (const c of (t as any)._def.checks ?? []) {
      if (c.kind === "min") s.minimum = c.value;
      if (c.kind === "max") s.maximum = c.value;
    }
  } else if (t instanceof z.ZodBoolean) s = { type: "boolean" };
  else if (t instanceof z.ZodEnum) s = { type: "string", enum: t.options };
  else if (t instanceof z.ZodArray) {
    s = { type: "array", items: toSchema((t as any)._def.type).schema };
    if ((t as any)._def.maxLength) s.maxItems = (t as any)._def.maxLength.value;
    if ((t as any)._def.minLength) s.minItems = (t as any)._def.minLength.value;
  } else if (t instanceof z.ZodObject) s = jsonSchema(t as z.ZodObject<z.ZodRawShape>);
  if (nullable && s.type) s.type = [s.type, "null"];
  if (desc) s.description = desc;
  return { schema: s, optional };
}

function jsonSchema(obj: z.ZodObject<z.ZodRawShape>) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, raw] of Object.entries(obj.shape)) {
    const { schema, optional } = toSchema(raw as z.ZodTypeAny);
    properties[key] = schema;
    if (!optional) required.push(key);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

export function listTools() {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: jsonSchema(t.input),
    annotations: { title: t.title, ...t.annotations },
  }));
}

type RpcReq = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

function ok(id: RpcReq["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function err(id: RpcReq["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export async function handleRpc(ctx: Ctx, msg: RpcReq): Promise<object | null> {
  const isNotification = msg.id === undefined;
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return err(msg?.id, -32600, "Invalid Request");
  }
  switch (msg.method) {
    case "initialize": {
      const requested = msg.params?.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0];
      return ok(msg.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Instinct Hub is the user's task ledger. When the user gives you an instruction, call list_tasks (query) to check for an existing task, then create_task. Call update_task with status/progress/message as work progresses, set status needs_review when you need the user's sign-off, and complete_task with the result when finished. Timestamps: Task Compass separates when things actually happened (initiated_at, started_at, last_activity_at, completed_at, history[].occurred_at) from when you uploaded them (created_at). For past work, always pass the real ISO 8601 times with timezone; pass null when a date is unknown and explain in timestamp_notes — never invent dates. Use import_tasks to bulk-import or backfill dates on existing tasks (matched by id, external_ref or exact title, never duplicated); list_tasks with missing_original_date=true finds tasks still lacking an original date.",
      });
    }
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, { tools: listTools() });
    case "tools/call": {
      const name = msg.params?.name;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return err(msg.id, -32602, `Unknown tool: ${name}`);
      const parsed = tool.input.safeParse(msg.params?.arguments ?? {});
      if (!parsed.success) {
        return ok(msg.id, {
          isError: true,
          content: [{ type: "text", text: `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}` }],
        });
      }
      try {
        const result = (await tool.run(ctx, parsed.data)) as Record<string, unknown>;
        return ok(msg.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        });
      } catch (e) {
        const message = e instanceof ToolErr ? e.message : "Internal error while running the tool.";
        if (!(e instanceof ToolErr)) console.error("[mcp] tool failure", name, e);
        return ok(msg.id, { isError: true, content: [{ type: "text", text: message }] });
      }
    }
    default:
      if (isNotification || msg.method.startsWith("notifications/")) return null;
      return err(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
