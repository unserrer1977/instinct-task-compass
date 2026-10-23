---
name: ai-assistant-task-dashboard
description: Build a task-tracking dashboard for a personal AI assistant, with an API-key-protected MCP server so the assistant can create, update, complete and import tasks (including historical timestamps and attachments), plus bulk status actions with Undo and an AI Q&A chat over the tasks. Use when building an app that an external AI agent writes tasks into via MCP, or when adding historical imports, attachments, bulk actions or task Q&A to such an app.
---

# AI-assistant task dashboard with MCP

A web dashboard (TanStack Start + Postgres/Supabase-style backend with RLS) that tracks every task an external AI assistant was asked to do. The assistant writes through an MCP server; the human manages tasks in the UI. Both stay in sync.

## 1. Data model

- `tasks`: id, user_id, title, description, status (`queued|in_progress|waiting|needs_review|done|cancelled`), progress 0-100, notes, category, `external_ref` (assistant's own id, unique per user — the dedupe key).
- `task_updates`: audit/history rows (task_id, user_id, kind, message, actor `assistant|user`).
- `mcp_credentials`: user_id, `token_hash` (SHA-256 only, never the raw key), label, created_at, last_used_at, revoked_at.
- `task_attachments`: task_id, user_id, path, name, mime, size, sha256 (unique per task+sha256), original date.
- RLS on every table: owner only (`auth.uid() = user_id`), plus explicit GRANTs.

### Real-event time vs record time (critical)
Keep separate columns for **when it happened** vs **when it was uploaded**:
- Event times, NULL = unknown: `initiated_at`, `started_at`, `last_activity_at`, `completed_at`; on updates `occurred_at`.
- Record time: `created_at` (import time).
- Generated sort columns, e.g. `sort_created_at = coalesce(initiated_at, created_at)`, `effective_at = coalesce(occurred_at, created_at)`.
- Any "touch" trigger must NOT fill event timestamps with now() on assistant inserts, or historical imports get overwritten.
- Accept only ISO 8601 with a timezone offset; reject naive dates; never invent missing dates. Allow a `date_uncertain`/precision flag.

## 2. MCP server

Stateless JSON-RPC over HTTP POST at a public route (e.g. `/api/public/mcp`) — implement `initialize`, `tools/list`, `tools/call`, `ping`; return 202 for notifications; support batches; CORS; GET returns 405 (no SSE).

Auth: per-user API keys with a recognisable prefix (`<prefix>_` + 40 random url-safe chars).
1. Validate format before any DB work.
2. Hash with SHA-256, look up `token_hash`, reject if missing/revoked (401 + `WWW-Authenticate`).
3. Update `last_used_at`.
4. Using an admin client after verification is acceptable ONLY if every query is filtered by the key's `user_id`.

Tools (each validates input with zod and scopes by user_id):
- `get_summary`, `list_tasks` (filters, pagination), `get_task`, `find_task` (by external_ref/title — call before creating)
- `create_task` (idempotent upsert on external_ref; returns existing on duplicate), `update_task`, `add_progress_note`, `complete_task`, `cancel_task`, `delete_task`
- `import_tasks` (batch, historical timestamps, per-item result: created/updated/skipped)
- `add_attachment` (base64 or URL, to existing tasks only; dedupe by sha256), `list_attachments`

Tool descriptions should tell the agent: look up before creating, send original timestamps, omit unknown dates.

## 3. Settings → MCP Integration page
Generate key (shown once, copy button), revoke, regenerate; server URL with copy; client config snippet; connection status from `last_used_at`; "Test connection" that calls `ping`/`get_summary` via a server function. Remind that hosted changes need republishing.

## 4. Dashboard UI
- Views: Today, Tasks (filters incl. Upcoming), Task detail (timeline, timestamps, attachments), History, Settings.
- Show full created/last-activity date-time with timezone; let titles wrap (no truncation).
- Realtime subscriptions on tasks, task_updates, credentials so assistant writes appear live.
- One-click Done on each card; checkboxes + Select All; bulk toolbar. Use one security-invoker RPC that atomically changes status, progress, completion time and writes history. Optimistic UI, toast with Undo; Undo passes the returned timestamps and refuses to overwrite rows changed since.

## 5. Attachments
Private storage bucket, path `<user_id>/<task_id>/<file>`; owner-only storage policies; preview/download via short-lived signed URLs; show name, type, size, source, date.

## 6. Ask-your-tasks chat (optional)
Authenticated streaming route: verify bearer, load the caller's tasks and recent updates with a caller-scoped client, send to an LLM through a server-only gateway helper with read-only instructions (cite tasks as links, never claim to mutate). One unified transcript saved per account; a tool tags each exchange with a topic for filtered viewing.

## 7. Verify end to end
- Unauthenticated / revoked key → 401.
- Create with a temporary key, re-send same external_ref → no duplicate.
- Import with past ISO dates → stored exactly; omitted dates stay NULL; UI shows originals.
- Attachment added via MCP → visible and previewable only to the owner.
- Bulk Done + Undo; Undo rejected after a newer change.
- Delete temporary keys and test data afterwards.

## Pitfalls
- Never store or log raw keys; never return other users' rows.
- Don't default event timestamps to now().
- Public routes bypass site auth — the handler must authenticate.
- Server code runs on an edge worker: use Web Crypto (`crypto.subtle.digest`), not Node `crypto`.
