import type { Tables } from "@/integrations/supabase/types";

export type Task = Tables<"tasks">;
export type TaskUpdate = Tables<"task_updates">;

export const TASK_STATUSES = [
  "queued",
  "scheduled",
  "in_progress",
  "needs_review",
  "completed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const CATEGORIES = [
  { name: "Work & Research", emoji: "💼", icon: "query_stats" },
  { name: "Travel", emoji: "✈️", icon: "flight_takeoff" },
  { name: "Finance", emoji: "💰", icon: "receipt_long" },
  { name: "Home & Errands", emoji: "🏠", icon: "shopping_cart_checkout" },
  { name: "Personal", emoji: "🙂", icon: "person" },
  { name: "Custom", emoji: "⚡", icon: "bolt" },
] as const;

export function categoryIcon(name: string): string {
  return CATEGORIES.find((c) => c.name === name)?.icon ?? "auto_awesome";
}

export const STATUS_META: Record<
  TaskStatus,
  { label: string; icon: string; chip: string; dot: string }
> = {
  queued: { label: "Waiting", icon: "hourglass_top", chip: "bg-surface-high text-muted-foreground", dot: "bg-muted-foreground" },
  scheduled: { label: "Scheduled", icon: "schedule", chip: "bg-surface-high text-muted-foreground", dot: "bg-muted-foreground" },
  in_progress: { label: "In Progress", icon: "sync", chip: "bg-info-soft/60 text-on-info-soft", dot: "bg-info" },
  needs_review: { label: "Needs Review", icon: "priority_high", chip: "bg-destructive-soft/70 text-on-destructive-soft", dot: "bg-destructive" },
  completed: { label: "Completed", icon: "check_circle", chip: "bg-success-soft/50 text-on-success-soft", dot: "bg-success" },
  cancelled: { label: "Cancelled", icon: "cancel", chip: "bg-surface-high text-muted-foreground", dot: "bg-outline" },
};

export function statusMeta(s: string) {
  return STATUS_META[(s as TaskStatus)] ?? STATUS_META.queued;
}

export function isOpen(t: Pick<Task, "status">) {
  return t.status !== "completed" && t.status !== "cancelled";
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTaskTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  }).format(date);
}
