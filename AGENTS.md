<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- The Control Centre dashboard uses a route-scoped theme and groups existing task categories and sources; it never infers external platforms that are absent from task records.
- Task Q&A uses an authenticated TanStack streaming route with caller-scoped task reads and a single account-saved UIMessage transcript; topics annotate exchanges and have read-view URLs, never separate communication sessions.
- New AI text calls use request-local Lovable AI Gateway Responses helpers in src/lib/ai, keeping credentials and prompts server-only and forwarding gateway-issued run IDs.
- The Instinct MCP server is a hand-rolled stateless JSON-RPC endpoint at `/api/public/mcp` (logic in `src/lib/instinct-mcp.ts`), authenticated by revocable per-user API keys (`inst_…`, only SHA-256 hashes stored in `mcp_credentials`) — the user explicitly asked for generate/copy/revoke keys rather than OAuth.
- After verifying the key hash, the MCP route uses the admin client and must scope every query by the key's `user_id`.
- Dashboard data syncs live via realtime on `tasks`, `task_updates`, `mcp_credentials` (see `useTaskSync`), so MCP writes appear without reload.
- Task-card status actions share a provider in AppShell and use the caller-scoped, security-invoker change_task_status RPC to atomically update tasks and audit history; Undo uses returned timestamps to reject overwriting newer changes.
- Tasks and task_updates separate real event times (`initiated_at`, `started_at`, `last_activity_at`, `completed_at`, `occurred_at`; NULL = unknown) from record/import times (`created_at`); sorting uses generated `sort_*_at`/`effective_at` columns, and the `touch_task` trigger never fills timestamps on Instinct inserts so historical imports are never overwritten with "now".
- Task attachments live in the private `task-attachments` bucket under `<user_id>/<task_id>/…` with metadata in `task_attachments` (owner RLS, unique per task+sha256 to avoid duplicates); MCP attachment tools attach only to existing tasks.
