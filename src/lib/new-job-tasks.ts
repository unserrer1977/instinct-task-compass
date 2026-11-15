import type { Task } from "@/lib/tasks";

export function isNewJobTask(task: Pick<Task, "category" | "title">) {
  const category = task.category.trim().toLowerCase().replace(/[_\s]+/g, "-");
  return ["job-start", "new-job", "new-role", "onboarding"].includes(category)
    || /\b(new job|new role|job start)\b/i.test(task.title);
}

/** Career/work records and explicitly Instinct-related tasks, including Instinct-sourced work. */
export function isCareerTask(task: Pick<Task, "category" | "title" | "source" | "description" | "notes" | "current_step">) {
  const category = task.category.trim().toLowerCase().replace(/[_\s]+/g, "-");
  const text = [task.title, task.description, task.notes, task.current_step].filter(Boolean).join(" ");
  return task.source === "instinct"
    || isNewJobTask(task)
    || /^(work(?:-&-research)?|job(?:-search|-applications?)?|career|employment|current-job|recruitment)$/.test(category)
    || /\b(instinct|new job|new role|current job|keep(?:ing)? my job|job search|job hunting|job applications?|cover letters?|curriculum vitae|recruiter|interviews?|redundancy|performance review|probation|onboarding)\b/i.test(text)
    || /\b(apply|application|follow.up)\b[\s\S]*\b(role|job|position|venture partner|director|employment)\b/i.test(text)
    || /\bCVs?\b/.test(text);
}