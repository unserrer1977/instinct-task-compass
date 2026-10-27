import type { Task } from "@/lib/tasks";

const H = 3600_000;
const ago = (h: number) => new Date(Date.now() - h * H).toISOString();
type Seed = [string, string, Task["status"], string, number, number, string?, string?];
// [title, category, status, source, hoursAgoCreated, progress, current_step, description]
const SEEDS: Seed[] = [
  ["Book flights London → Lisbon for May bank holiday", "Travel", "needs_review", "instinct", 30, 80, "Pick between 07:40 TAP or 10:15 easyJet", "Compare prices on Google Flights and confirm with Claude."],
  ["Approve Q2 marketing budget draft", "Finance", "needs_review", "instinct", 52, 90, "Review the Notion summary and sign off", "Draft prepared in Notion from Gmail threads."],
  ["Reply to Sarah about the offsite venue", "Work & Research", "needs_review", "instinct", 6, 70, "Choose: Soho House or The Ned", "Drafted WhatsApp reply waiting for your tone check."],
  ["Research competitor pricing for Tab pendant", "Work & Research", "in_progress", "instinct", 20, 55, undefined, "ChatGPT deep research across 12 sources."],
  ["Refactor landing page hero in Lovable", "Work & Research", "in_progress", "instinct", 4, 35, undefined, "Lovable agent updating the hero copy and layout."],
  ["Reconcile October card statements", "Finance", "in_progress", "instinct", 9, 60, undefined, "Matching Gmail receipts against statements."],
  ["Sync Home Assistant heating schedule", "Home & Errands", "in_progress", "instinct", 2, 20, undefined, "Adjusting Home Assistant schedule for winter."],
  ["Summarise yesterday's Tab conversations", "Personal", "in_progress", "instinct", 1, 45, undefined, "Pulling transcripts from Tab and summarising with Claude."],
  ["Order birthday gift for Mum", "Personal", "queued", "dashboard", 70, 0, undefined, "Something under £80, arrives before Saturday."],
  ["Renew car insurance", "Finance", "queued", "instinct", 96, 0, undefined, "Compare at least three quotes."],
  ["Plan Sunday meal prep shopping list", "Home & Errands", "queued", "dashboard", 12, 0],
  ["Set up GitHub repo for side project", "Work & Research", "queued", "instinct", 40, 0, undefined, "Create GitHub repo with README and CI."],
  ["Find a dentist near the office", "Personal", "scheduled", "instinct", 120, 0],
  ["Draft weekly update for the team in Slack", "Work & Research", "completed", "instinct", 26, 100, undefined, "Posted to Slack #general."],
  ["Cancel unused streaming subscription", "Finance", "completed", "dashboard", 50, 100],
  ["Book hotel in Porto", "Travel", "completed", "instinct", 80, 100, undefined, "Booked via Gmail confirmation."],
  ["Schedule boiler service", "Home & Errands", "completed", "instinct", 140, 100, undefined, "Added to Google Calendar for Thursday."],
  ["Collect receipts for expense claim", "Finance", "completed", "instinct", 200, 100],
];

export const DEMO_TASKS: Task[] = SEEDS.map(([title, category, status, source, h, progress, current_step, description], i) => {
  const created = ago(h), activity = ago(Math.max(0.2, h / 4)), done = status === "completed" ? ago(Math.max(0.3, h / 5)) : null;
  return {
    id: `demo-${i + 1}`, user_id: "demo", title, category, status, source, progress,
    description: description ?? null, current_step: current_step ?? null,
    priority: i === 0 || i === 1 ? "urgent" : "normal", autonomy: "requires_approval",
    deadline: null, notes: null, result: null, external_ref: null, timestamp_notes: null,
    created_at: created, updated_at: activity, initiated_at: created, started_at: status === "queued" ? null : created,
    last_activity_at: activity, completed_at: done, sort_initiated_at: created, sort_activity_at: activity,
  };
});
