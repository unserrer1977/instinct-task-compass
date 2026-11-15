import { describe, expect, it } from "vitest";
import { isNewJobTask, isCareerTask } from "@/lib/new-job-tasks";

describe("new job task scope", () => {
  it("includes explicit new-role categories", () => {
    expect(isNewJobTask({ category: "job-start", title: "Confirm start date" })).toBe(true);
    expect(isNewJobTask({ category: "New role", title: "Review contract" })).toBe(true);
  });
  it("does not equate job searching or unrelated onboarding with the new role", () => {
    expect(isNewJobTask({ category: "job-search", title: "Prepare an application" })).toBe(false);
    expect(isNewJobTask({ category: "work", title: "Draft customer onboarding post" })).toBe(false);
  });
});

describe("work and career access", () => {
  const task = { title: "A task", category: "Personal", source: "dashboard", description: null, notes: null, current_step: null };
  it("includes Instinct tasks", () => {
    expect(isCareerTask({ ...task, source: "instinct" })).toBe(true);
    expect(isCareerTask({ ...task, title: "Configure Instinct reporting" })).toBe(true);
  });
  it("includes searching for a new job across category spellings", () => {
    for (const category of ["job-search", "Job search", "job_search"]) expect(isCareerTask({ ...task, category })).toBe(true);
  });
  it("includes keeping the current job and work records", () => {
    expect(isCareerTask({ ...task, title: "Plan to keep my job" })).toBe(true);
    expect(isCareerTask({ ...task, category: "Work & Research" })).toBe(true);
  });
  it("includes preparation and responses to applications", () => {
    expect(isCareerTask({ ...task, title: "Prepare cover letter" })).toBe(true);
    expect(isCareerTask({ ...task, title: "Follow up on Pairs Venture Partner application" })).toBe(true);
    expect(isCareerTask({ ...task, description: "Respond to the recruiter about the interview" })).toBe(true);
  });
  it("leaves unrelated self-created personal tasks out", () => {
    expect(isCareerTask({ ...task, title: "Buy groceries" })).toBe(false);
  });
});