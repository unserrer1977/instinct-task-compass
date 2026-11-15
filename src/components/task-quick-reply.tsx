import { useContext, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { emailTaskReply } from "@/lib/task-reply.functions";
import { LoaderCircle, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { DemoMode } from "@/hooks/use-tasks";
import { supabase } from "@/integrations/supabase/client";
import type { Task } from "@/lib/tasks";
import { taskReplyRecord } from "@/lib/task-reply";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function TaskQuickReply({ task, compact = false }: { task: Task; compact?: boolean }) {
  const demo = useContext(DemoMode);
  const qc = useQueryClient();
  const sendEmail = useServerFn(emailTaskReply);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [demoReplies, setDemoReplies] = useState<string[]>([]);
  const [savedReplyId, setSavedReplyId] = useState<string | null>(null);
  const lock = useRef(false);

  async function send() {
    if (!draft.trim() || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (demo) {
        setDemoReplies((previous) => [...previous, draft.trim()]);
      } else {
        let updateId = savedReplyId;
        if (!updateId) {
          const { data, error: authError } = await supabase.auth.getUser();
          if (authError) throw authError;
          if (!data.user) throw new Error("Sign in to send a reply.");
          const record = taskReplyRecord(task.id, data.user.id, draft, new Date().toISOString());
          const { data: saved, error: saveError } = await supabase.from("task_updates").insert(record).select("id").single();
          if (saveError) throw saveError;
          if (!saved) throw new Error("Couldn't save your reply.");
          updateId = saved.id;
          setSavedReplyId(updateId);
        }
        void qc.invalidateQueries({ queryKey: ["task_updates"] });
        void qc.invalidateQueries({ queryKey: ["tasks"] });
        const delivery = await sendEmail({ data: { updateId } });
        if (!delivery.sent) throw new Error(delivery.error);
      }
      setDraft("");
      setSavedReplyId(null);
      if (!demo) setOpen(false);
      toast.success(demo ? "Demo reply saved for this visit" : "Reply emailed to Instinct", {
        description: demo ? undefined : "Email accepted by Resend; reply also saved to task activity.",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (cause as { message?: string })?.message ?? "Couldn't send your reply. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <Dialog open={open} onOpenChange={(next) => { if (!lock.current) { setOpen(next); setError(""); } }}>
    <DialogTrigger asChild>
      <Button variant="ghost" size="sm" className={compact ? "h-7 px-2 text-xs" : undefined} aria-label={`Reply to ${task.title}`} title="Quick reply"><MessageSquare className="size-3.5" />Reply</Button>
    </DialogTrigger>
    <DialogContent className={`${compact ? "control-centre " : ""}z-[60] w-[calc(100%-2rem)] max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-lg bg-background text-foreground`}>
      <DialogHeader>
        <DialogTitle className="pr-6 break-words [overflow-wrap:anywhere] leading-snug">Reply to {task.title}</DialogTitle>
        <DialogDescription>{demo ? "Demo reply · saved only for this visit" : "To Instinct · from tasks@glenluna.com"}</DialogDescription>
      </DialogHeader>
      {demoReplies.length > 0 && <ol aria-label="Demo replies" className="space-y-2 text-sm">{demoReplies.map((text, index) => <li key={index} className="whitespace-pre-wrap break-words border-b border-border pb-2">{text}</li>)}</ol>}
      <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <Textarea aria-label="Reply message" placeholder="Write a reply…" value={draft} disabled={busy || Boolean(savedReplyId)} onChange={(event) => setDraft(event.target.value)} className="min-h-28 max-h-60 resize-y" onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void send(); } }} />
        {error && <p role="alert" className="text-sm text-destructive break-words">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" disabled={busy || !draft.trim()}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}{busy ? "Sending…" : savedReplyId ? "Retry email" : "Send reply"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}