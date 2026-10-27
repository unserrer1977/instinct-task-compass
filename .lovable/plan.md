# Task detail page in the Control Centre design

Opening a task from the dashboard will keep the same dark charcoal look, teal accents, fonts, header and bottom menu instead of switching to the old light layout.

## What changes
- The task detail page uses the same page frame as the dashboard (theme, header, bottom menu, wide layout).
- The page is restyled to match the dashboard cards:
  - Top bar: "Back to Control Centre" link, task title (full, wrapping), status chip with the dashboard's colour dots, Instinct/You badge plus agent logo badges, category and priority.
  - A two-column layout on desktop (single column on phone): left side holds description, progress, Result, Notes, Attachments and the activity log; right side holds the dates panel (Created, Work started, Last activity, Deadline, Completed, Imported) and the action panel (Done, Approve, change status, Cancel/Delete).
  - Activity log styled like the dashboard's live activity list, keeping real event times and "Uploaded" labels.
- Attachments section adopts the same card and button styles; preview/download behaviour unchanged.
- Back link and task links from the dashboard return to the dashboard.
- All existing behaviour (notes, status changes, delete, attachments, live sync) stays exactly the same.

## Technical details
- `app-shell.tsx`: replace the `path === "/today"` check with a helper matching `/today` and `/tasks/<id>`, so both render the `.control-centre` shell.
- `tasks.$id.tsx`: restructure markup into the board-card styling (`cc-heading`, `cc-label`, border/surface tokens), add `PlatformBadges`, use `TaskCardActions` for Done; keep `patch`/`remove` logic.
- `task-attachments.tsx`: token-only class tweaks so it reads correctly on the dark theme.
- Verify in the browser at desktop and phone width, signed in, opening a real task from the dashboard.
- Update AGENTS.md rule: the Control Centre theme covers the dashboard and task detail page.
