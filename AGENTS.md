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
- The Instinct MCP server is a hand-rolled stateless JSON-RPC endpoint at `/api/public/mcp` (logic in `src/lib/instinct-mcp.ts`), authenticated by revocable per-user API keys (`inst_…`, only SHA-256 hashes stored in `mcp_credentials`) — the user explicitly asked for generate/copy/revoke keys rather than OAuth.
- After verifying the key hash, the MCP route uses the admin client and must scope every query by the key's `user_id`.
- Dashboard data syncs live via realtime on `tasks`, `task_updates`, `mcp_credentials` (see `useTaskSync`), so MCP writes appear without reload.
