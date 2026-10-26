import type { CSSProperties } from "react";
import type { Task } from "@/lib/tasks";

/** Agents, harnesses and services, detected only when explicitly named in the task record. Brand colours are identity marks, not theme colours. */
export const PLATFORMS = [
  { key: "claude", label: "Claude", match: /\bclaude\b/i, slug: "claude", color: "D97757" },
  { key: "chatgpt", label: "ChatGPT", match: /\b(chatgpt|openai|gpt-\d)/i, slug: "openai", color: "10A37F" },
  { key: "gemini", label: "Gemini", match: /\bgemini\b/i, slug: "googlegemini", color: "8E75B2" },
  { key: "lovable", label: "Lovable", match: /\blovable\b/i, slug: "lovable", color: "FF4F8B" },
  { key: "cursor", label: "Cursor", match: /\bcursor\b/i, slug: "cursor", color: "E6E6E6" },
  { key: "github", label: "GitHub", match: /\bgithub\b/i, slug: "github", color: "E6E6E6" },
  { key: "whatsapp", label: "WhatsApp", match: /\bwhatsapp\b/i, slug: "whatsapp", color: "25D366" },
  { key: "gmail", label: "Gmail", match: /\bgmail\b/i, slug: "gmail", color: "EA4335" },
  { key: "calendar", label: "Calendar", match: /\bgoogle calendar\b|\bcalendar\b/i, slug: "googlecalendar", color: "4285F4" },
  { key: "notion", label: "Notion", match: /\bnotion\b/i, slug: "notion", color: "E6E6E6" },
  { key: "slack", label: "Slack", match: /\bslack\b/i, slug: "slack", color: "E01E5A" },
  { key: "homeassistant", label: "Home Assistant", match: /\bhome assistant\b/i, slug: "homeassistant", color: "18BCF2" },
  { key: "zapier", label: "Zapier", match: /\bzapier\b/i, slug: "zapier", color: "FF4F00" },
  { key: "n8n", label: "n8n", match: /\bn8n\b/i, slug: "n8n", color: "EA4B71" },
] as const;

export function detectPlatforms(t: Pick<Task, "title" | "description" | "notes" | "current_step">) {
  const text = [t.title, t.description, t.notes, t.current_step].filter(Boolean).join(" ");
  return PLATFORMS.filter((p) => p.match.test(text));
}

export function PlatformBadge({ p, compact }: { p: (typeof PLATFORMS)[number]; compact?: boolean }) {
  const style = { color: `#${p.color}`, borderColor: `#${p.color}66`, background: `#${p.color}1a` } as CSSProperties;
  return (
    <span title={p.label} style={style} className="cc-label inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5">
      <img src={`https://cdn.simpleicons.org/${p.slug}/${p.color}`} alt="" className="size-3" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
      {!compact && p.label}
    </span>
  );
}

export function PlatformBadges({ task, compact }: { task: Task; compact?: boolean }) {
  const list = detectPlatforms(task);
  if (!list.length) return null;
  return <>{list.map((p) => <PlatformBadge key={p.key} p={p} compact={compact} />)}</>;
}
