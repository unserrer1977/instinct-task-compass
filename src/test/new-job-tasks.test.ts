import { describe, expect, it } from "vitest";
import { isNewJobTask } from "@/lib/new-job-tasks";

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