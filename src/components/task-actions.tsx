import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useTasks, DemoMode } from "@/hooks/use-tasks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TASK_STATUSES, statusMeta, type Task, type TaskStatus } from "@/lib/tasks";
import { statusPatch, toggleTaskSelection, undoRecords } from "@/lib/task-status";

type Actions = {
  selected: Set<string>;
  busy: boolean;
  select: (ids: string[], checked: boolean) => void;
  change: (ids: string[], status: TaskStatus) => Promise<void>;
};
const TaskActionsContext = createContext<Actions | null>(null);

export function useTaskActions() {
  const context = useContext(TaskActionsContext);
  if (!context) throw new Error("Task actions require their provider");
  return context;
}

export function TaskActionsProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const demo = useContext(DemoMode);
  const key = demo ? ["tasks", "demo"] : ["tasks"];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  async function run(ids: string[], status?: TaskStatus, restore?: ReturnType<typeof undoRecords>) {
    if (lock.current || !ids.length) return;
    lock.current = true;
    setBusy(true);
    await qc.cancelQueries({ queryKey: key });
    const previous = qc.getQueryData<Task[]>(key) ?? [];
    const now = new Date().toISOString();
    qc.setQueryData<Task[]>(key, previous.map((task) => {
      if (!ids.includes(task.id)) return task;
      const old = restore?.find((row) => row.id === task.id);
      return old ? { ...task, status: old.status, progress: old.progress, completed_at: old.completed_at, updated_at: now } : status ? { ...task, ...statusPatch(task, status, now) } : task;
    }));
    try {
      const { data, error } = demo
        ? { data: { before: previous.filter((t) => ids.includes(t.id)), after: (qc.getQueryData<Task[]>(key) ?? []).filter((t) => ids.includes(t.id)) }, error: null }
        : await supabase.rpc("change_task_status", {
        p_ids: ids,
        ...(status ? { p_status: status } : {}),
        ...(restore ? { p_restore: restore as Json } : {}),
      });
      if (error) throw error;
      const result = data as unknown as { before: Task[]; after: Task[] };
      qc.setQueryData<Task[]>(key, (rows = []) => rows.map((row) => result.after.find((task) => task.id === row.id) ?? row));
      setSelected((old) => toggleTaskSelection(old, ids, false));
      if (restore) toast.success(`Restored ${ids.length} task${ids.length === 1 ? "" : "s"}`);
      else toast.success(`${ids.length} task${ids.length === 1 ? "" : "s"} marked ${status === "completed" ? "Done" : statusMeta(status ?? "queued").label}`, {
        duration: 15000,
        action: { label: "Undo", onClick: () => { void run(ids, undefined, undoRecords(result.before, result.after)); } },
      });
    } catch (error) {
      qc.setQueryData<Task[]>(key, (rows = []) => rows.map((row) => ids.includes(row.id) ? previous.find((task) => task.id === row.id) ?? row : row));
      toast.error(error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Couldn't update tasks. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
      if (!demo) {
        void qc.invalidateQueries({ queryKey: ["tasks"] });
        void qc.invalidateQueries({ queryKey: ["task_updates"] });
      }
    }
  }

  return <TaskActionsContext.Provider value={{ selected, busy, select: (ids, checked) => setSelected((old) => toggleTaskSelection(old, ids, checked)), change: (ids, status) => run(ids, status) }}>{children}</TaskActionsContext.Provider>;
}

export function TaskCardActions({ task, compact = false }: { task: Task; compact?: boolean }) {
  const { selected, select, busy, change } = useTaskActions();
  return (
    <div className={`flex items-center justify-between gap-3 border-t border-border ${compact ? "pt-1.5 mt-1.5" : "pt-3 mt-3"}`}>
      <label className={`flex cursor-pointer items-center gap-2 text-xs text-muted-foreground ${compact ? "min-h-7" : "min-h-9"}`}>
        <Checkbox aria-label={`Select ${task.title}`} checked={selected.has(task.id)} disabled={busy} onCheckedChange={(checked) => select([task.id], checked === true)} />
        Select
      </label>
      <Button size="sm" className={compact ? "h-7 px-2 text-xs" : undefined} disabled={busy || task.status === "completed"} onClick={() => { void change([task.id], "completed"); }} aria-label={`Mark ${task.title} Done`}>
        {busy ? <LoaderCircle className="animate-spin" /> : <Check />} Done
      </Button>
    </div>
  );
}

export function TaskSelectionBar({ tasks }: { tasks: Task[] }) {
  const { selected, select, busy, change } = useTaskActions();
  const { data: allTasks = [] } = useTasks();
  const ids = tasks.map((task) => task.id);
  const checkedCount = ids.filter((id) => selected.has(id)).length;
  const selectedIds = allTasks.filter((task) => selected.has(task.id)).map((task) => task.id);
  if (!tasks.length && !selectedIds.length) return null;
  return (
    <div className="sticky top-16 z-40 border-b border-border bg-background/95 py-2 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium">
          <Checkbox aria-label="Select All" disabled={busy || !ids.length} checked={checkedCount === ids.length && ids.length > 0 ? true : checkedCount > 0 ? "indeterminate" : false} onCheckedChange={(checked) => select(ids, checked === true)} />
          Select All {tasks.length > 0 && <span className="text-xs text-muted-foreground">({tasks.length})</span>}
        </label>
        {selectedIds.length > 0 && <div className="flex items-center gap-2"><span className="text-xs font-semibold" aria-live="polite">{selectedIds.length} selected</span><Button size="icon" variant="ghost" aria-label="Clear selection" title="Clear selection" disabled={busy} onClick={() => select([...selected], false)}><X /></Button></div>}
      </div>
      {selectedIds.length > 0 && <div role="toolbar" aria-label="Bulk task actions" className="flex flex-wrap items-center gap-2 pb-1">
        <Button disabled={busy} onClick={() => { void change(selectedIds, "completed"); }}>{busy ? <LoaderCircle className="animate-spin" /> : <Check />} Done ({selectedIds.length})</Button>
        <select aria-label="Change selected tasks status" value="" disabled={busy} className="h-9 min-w-0 rounded-md border border-input bg-card px-2 text-sm text-foreground" onChange={(event) => { if (event.target.value) void change(selectedIds, event.target.value as TaskStatus); }}>
          <option value="" disabled>Change status…</option>
          {TASK_STATUSES.map((status) => <option key={status} value={status}>{status === "completed" ? "Done" : statusMeta(status).label}</option>)}
        </select>
      </div>}
    </div>
  );
}