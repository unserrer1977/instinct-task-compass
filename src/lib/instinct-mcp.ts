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
  "id,title,description,category,status,priority,progress,current_step,autonomy,deadline,notes,result,external_ref,source,created_at,updated_at,completed_at";

class ToolErr extends Error {}

async function findTask(ctx: Ctx, id?: string, externalRef?: string) {
  if (!id && !externalRef) throw new ToolErr("Provide either id or external_ref.");
  let q = ctx.db.from("tasks").select(TASK_FIELDS).eq("user_id", ctx.userId);
  q = id ? q.eq("id", id) : q.eq("external_ref", externalRef!);
  const { data, error } = await q.maybeSingle();
  if (error) throw new ToolErr(error.message);
  if (!data) throw new ToolErr("Task not found.");
  return data;
}

async function logUpdate(
  ctx: Ctx,
  taskId: string,
  message: string,
  extra: { kind?: string; status?: string | null; progress?: number | null } = {},
) {
  await ctx.db.from("task_updates").insert({
    task_id: taskId,
    user_id: ctx.userId,
    message,
    kind: extra.kind ?? "progress",
    status: extra.status ?? null,
    progress: extra.progress ?? null,
    source: "instinct",
  });
}

const ref = {
  id: z.string().uuid().optional().describe("Task id (UUID)."),
  external_ref: z.string().max(200).optional().describe("Your own stable reference for the task, if you set one at creation."),
};

type ToolDef = {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject<z.ZodRawShape>;
  annotations: Record<string, boolean>;
  run: (ctx: Ctx, args: any) => Promise<unknown>;
};

export const TOOLS: ToolDef[] = [
  {
    name: "get_task_summary",
    title: "Get task summary",
    description: "Counts of the user's tasks by status plus the most recently active tasks. Call at the start of a session for context.",
    input: z.object({}).strict(),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (ctx) => {
      const { data, error } = await ctx.db.from("tasks").select("status").eq("user_id", ctx.userId);
      if (error) throw new ToolErr(error.message);
      const counts: Record<string, number> = {};
      for (const r of data ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
      const { data: recent } = await ctx.db
        .from("tasks")
        .select("id,title,status,progress,updated_at")
        .eq("user_id", ctx.userId)
        .order("updated_at", { ascending: false })
        .limit(5);
      return { counts, total: data?.length ?? 0, recent: recent ?? [] };
    },
  },
  {
    name: "list_tasks",
    title: "List tasks",
    description:
      "List or search the user's tasks. Use before creating a task to avoid duplicates and to continue existing work.",
    input: z
      .object({
        status: z.array(STATUS).optional().describe("Only these statuses."),
        query: z.string().max(200).optional().describe("Case-insensitive text search in title and description."),
        include_closed: z.boolean().optional().describe("Include completed/cancelled tasks (default false)."),
        limit: z.number().int().min(1).max(100).optional().describe("Max results, default 25."),
      })
      .strict(),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      let q = ctx.db.from("tasks").select(TASK_FIELDS).eq("user_id", ctx.userId);
      if (a.status?.length) q = q.in("status", a.status);
      else if (!a.include_closed) q = q.not("status", "in", "(completed,cancelled)");
      if (a.query) {
        const s = String(a.query).replace(/[%,()]/g, " ").trim();
        if (s) q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
      }
      const { data, error } = await q.order("updated_at", { ascending: false }).limit(a.limit ?? 25);
      if (error) throw new ToolErr(error.message);
      return { tasks: data ?? [], count: data?.length ?? 0 };
    },
  },
  {
    name: "get_task",
    title: "Get task",
    description: "Get one task with its full progress history.",
    input: z.object(ref).strict(),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      const task = await findTask(ctx, a.id, a.external_ref);
      const { data: updates } = await ctx.db
        .from("task_updates")
        .select("message,kind,status,progress,source,created_at")
        .eq("task_id", task.id)
        .order("created_at", { ascending: true });
      return { task, updates: updates ?? [] };
    },
  },
  {
    name: "create_task",
    title: "Create task",
    description:
      "Record a new task the user asked Instinct to do. Deduplicates: if an open task with the same external_ref or the same title exists, it is returned instead (duplicate=true).",
    input: z
      .object({
        title: z.string().min(1).max(300).describe("Short task title."),
        description: z.string().max(5000).optional().describe("The user's instruction in full."),
        category: z.string().max(60).optional().describe("e.g. Work & Research, Travel, Finance, Home & Errands, Personal."),
        priority: PRIORITY.optional(),
        status: STATUS.optional().describe("Initial status, default queued."),
        deadline: z.string().datetime({ offset: true }).optional().describe("ISO 8601 deadline."),
        notes: z.string().max(5000).optional(),
        external_ref: z.string().max(200).optional().describe("Stable id from Instinct for idempotent creation."),
        allow_duplicate: z.boolean().optional().describe("Skip duplicate detection (default false)."),
      })
      .strict(),
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      if (!a.allow_duplicate) {
        if (a.external_ref) {
          const { data } = await ctx.db.from("tasks").select(TASK_FIELDS).eq("user_id", ctx.userId).eq("external_ref", a.external_ref).maybeSingle();
          if (data) return { task: data, duplicate: true };
        }
        const { data: same } = await ctx.db
          .from("tasks")
          .select(TASK_FIELDS)
          .eq("user_id", ctx.userId)
          .ilike("title", a.title.replace(/[%_]/g, "\\$&"))
          .not("status", "in", "(completed,cancelled)")
          .limit(1);
        if (same?.length) return { task: same[0], duplicate: true };
      }
      const { data, error } = await ctx.db
        .from("tasks")
        .insert({
          user_id: ctx.userId,
          title: a.title,
          description: a.description ?? null,
          category: a.category ?? "Work & Research",
          priority: a.priority ?? "normal",
          status: a.status ?? "queued",
          deadline: a.deadline ?? null,
          notes: a.notes ?? null,
          external_ref: a.external_ref ?? null,
          source: "instinct",
        })
        .select(TASK_FIELDS)
        .single();
      if (error) throw new ToolErr(error.message);
      await logUpdate(ctx, data.id, "Task received from Instinct", { kind: "created", status: data.status });
      return { task: data, duplicate: false };
    },
  },
  {
    name: "update_task",
    title: "Update task",
    description:
      "Update a task's status, progress, current step, notes or other fields. Include `message` to log a progress update the user will see.",
    input: z
      .object({
        ...ref,
        status: STATUS.optional(),
        progress: z.number().int().min(0).max(100).optional().describe("Percent complete."),
        current_step: z.string().max(300).optional().describe("What Instinct is doing right now."),
        message: z.string().max(2000).optional().describe("Progress note to append to the history."),
        title: z.string().min(1).max(300).optional(),
        description: z.string().max(5000).optional(),
        category: z.string().max(60).optional(),
        priority: PRIORITY.optional(),
        deadline: z.string().datetime({ offset: true }).nullable().optional(),
        notes: z.string().max(5000).optional(),
        result: z.string().max(10000).optional(),
      })
      .strict(),
    annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
    run: async (ctx, a) => {
      const task = await findTask(ctx, a.id, a.external_ref);
      const patch: Database["public"]["Tables"]["tasks"]["Update"] = {};
      for (const k of ["status", "progress", "current_step", "title", "description", "category", "priority", "deadline", "notes", "result"] as const) {
        if (a[k] !== undefined) (patch as any)[k] = a[k];
      }
      if (Object.keys(patch).length === 0 && !a.message) throw new ToolErr("Nothing to update.");
      let updated = task;
      if (Object.keys(patch).length) {
        const { data, error } = await ctx.db.from("tasks").update(patch).eq("id", task.id).eq("user_id", ctx.userId).select(TASK_FIELDS).single();
        if (error) throw new ToolErr(error.message);
        updated = data;
      }
      const statusChanged = a.status && a.status !== task.status;
      if (a.message || statusChanged) {
        await logUpdate(ctx, task.id, a.message ?? `Status changed to ${a.status}`, {
          kind: statusChanged ? "status" : "progress",
          status: a.status ?? null,
          progress: a.progress ?? null,
        });
      }
      return { task: updated };
    },
  },
  {
    name: "complete_task",
    title: "Complete task",
    description: "Mark a task as completed and record the outcome.",
    input: z
      .object({
        ...ref,
        result: z.string().max(10000).optional().describe("What was achieved / the deliverable."),
        notes: z.string().max(5000).optional(),
      })
      .strict(),
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      const task = await findTask(ctx, a.id, a.external_ref);
      const patch: Database["public"]["Tables"]["tasks"]["Update"] = { status: "completed", progress: 100, current_step: null };
      if (a.result !== undefined) patch.result = a.result;
      if (a.notes !== undefined) patch.notes = a.notes;
      const { data, error } = await ctx.db.from("tasks").update(patch).eq("id", task.id).eq("user_id", ctx.userId).select(TASK_FIELDS).single();
      if (error) throw new ToolErr(error.message);
      if (task.status !== "completed") await logUpdate(ctx, task.id, a.result ? `Completed: ${a.result.slice(0, 300)}` : "Task completed", { kind: "completed", status: "completed", progress: 100 });
      return { task: data };
    },
  },
  {
    name: "add_task_note",
    title: "Add progress note",
    description: "Append a progress note to a task's history without changing other fields.",
    input: z.object({ ...ref, message: z.string().min(1).max(2000) }).strict(),
    annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
    run: async (ctx, a) => {
      const task = await findTask(ctx, a.id, a.external_ref);
      await logUpdate(ctx, task.id, a.message, { kind: "note" });
      await ctx.db.from("tasks").update({ updated_at: new Date().toISOString() }).eq("id", task.id);
      return { ok: true, task_id: task.id };
    },
  },
  {
    name: "cancel_task",
    title: "Cancel task",
    description: "Cancel a task that should no longer be worked on.",
    input: z.object({ ...ref, reason: z.string().max(2000).optional() }).strict(),
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    run: async (ctx, a) => {
      const task = await findTask(ctx, a.id, a.external_ref);
      const { data, error } = await ctx.db.from("tasks").update({ status: "cancelled", current_step: null }).eq("id", task.id).eq("user_id", ctx.userId).select(TASK_FIELDS).single();
      if (error) throw new ToolErr(error.message);
      await logUpdate(ctx, task.id, a.reason ? `Cancelled: ${a.reason}` : "Task cancelled", { kind: "status", status: "cancelled" });
      return { task: data };
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
];

function jsonSchema(obj: z.ZodObject<z.ZodRawShape>) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, raw] of Object.entries(obj.shape)) {
    let t = raw as z.ZodTypeAny;
    let optional = false;
    let nullable = false;
    while (t instanceof z.ZodOptional || t instanceof z.ZodNullable || t instanceof z.ZodDefault) {
      if (t instanceof z.ZodNullable) nullable = true;
      else optional = true;
      t = (t as any)._def.innerType;
    }
    const desc = (raw as z.ZodTypeAny).description ?? t.description;
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
      const el = (t as any)._def.type;
      s = { type: "array", items: el instanceof z.ZodEnum ? { type: "string", enum: el.options } : { type: "string" } };
    }
    if (nullable) s.type = [s.type, "null"];
    if (desc) s.description = desc;
    properties[key] = s;
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
          "Instinct Hub is the user's task ledger. When the user gives you an instruction, call list_tasks (query) to check for an existing task, then create_task. Call update_task with status/progress/message as work progresses, set status needs_review when you need the user's sign-off, and complete_task with the result when finished.",
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
