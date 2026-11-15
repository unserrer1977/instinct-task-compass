import type { Task } from "@/lib/tasks";

// Explicit account binding: never send another account's task to this inbox.
const OWNER_ID = "0c424675-e718-4815-85ca-efa058f6b884";
export const REPLY_FROM = "Task Compass <tasks@glenluna.com>";
export const REPLY_TO = "inboxgyiubx@mail.instinct.com";

export function assertReplyOwner(userId: string) {
  if (userId !== OWNER_ID) throw new Error("Email replies to Instinct are not configured for this account.");
}

export function replyEmail(task: Task, message: string, occurredAt: string | null) {
  return {
    from: REPLY_FROM,
    to: REPLY_TO,
    subject: `Reply: ${task.title.replace(/[\r\n]+/g, " ")} [Compass ${task.id}]`,
    text: [
      "A task reply from Task Compass. Please match this to the task below, read the reply, act on these instructions, and update the matching task's progress in Task Compass. Do not create a duplicate task.",
      `Task: ${task.title}`,
      `Compass reference: ${task.id}`,
      `Instinct reference: ${task.external_ref ?? "Not recorded"}`,
      `Task URL: https://instinct-task-compass.lovable.app/tasks/${task.id}`,
      `Status: ${task.status}`,
      `Progress: ${task.progress}%`,
      `Current step: ${task.current_step ?? "Not recorded"}`,
      `Created: ${task.initiated_at ?? "Original date unknown"}`,
      `Last activity: ${task.last_activity_at ?? "Unknown"}`,
      `Deadline: ${task.deadline ?? "Not recorded"}`,
      `Reply date: ${occurredAt ?? "Unknown"}`,
      "", "Reply / requested action:", message,
      "", "Task description:", task.description ?? "Not recorded",
    ].join("\n"),
  };
}

export async function deliverTaskReply(task: Task, message: string, occurredAt: string | null, updateId: string) {
  const apiKey = process.env['LOVABLE_API_KEY'];
  const connectionKey = process.env['RESEND_API_KEY'];
  if (!apiKey || !connectionKey) return { sent: false as const, error: "Email sending is not configured. Your reply is saved; please try again after connecting Resend." };
  try {
    const response = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Connection-Api-Key": connectionKey,
        "Content-Type": "application/json",
        "Idempotency-Key": `task-reply-${updateId}`,
      },
      body: JSON.stringify(replyEmail(task, message, occurredAt)),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Instinct reply email failed [${response.status}]: ${body}`);
      return { sent: false as const, status: response.status, error: `Your reply is saved, but Resend did not accept the email (${response.status}): ${body}` };
    }
    const result = await response.json() as { id?: string };
    if (!result.id) return { sent: false as const, error: "Your reply is saved, but email acceptance could not be confirmed. Retry sending." };
    return { sent: true as const, emailId: result.id };
  } catch {
    return { sent: false as const, error: "Your reply is saved, but email acceptance could not be confirmed. Retry sending the same reply." };
  }
}