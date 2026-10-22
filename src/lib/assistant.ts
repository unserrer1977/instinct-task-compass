import type { UIMessage } from "ai";

export function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

export function topicMessages(
  messages: UIMessage[],
  topicId: string,
  assignments: Record<string, string>,
) {
  return topicId === "all"
    ? messages
    : messages.filter((message) => assignments[message.id] === topicId);
}

export function ownedTaskId(taskId: string | null, taskIds: Set<string>) {
  if (taskId !== null && !taskIds.has(taskId)) throw new Error("Task is not accessible.");
  return taskId;
}
