CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'Work & Research',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','scheduled','in_progress','needs_review','completed','cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  current_step text,
  autonomy text NOT NULL DEFAULT 'requires_approval',
  deadline timestamptz,
  notes text,
  result text,
  external_ref text,
  source text NOT NULL DEFAULT 'dashboard',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX tasks_user_idx ON public.tasks(user_id, updated_at DESC);
CREATE UNIQUE INDEX tasks_user_ref_idx ON public.tasks(user_id, external_ref) WHERE external_ref IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tasks select" ON public.tasks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own tasks insert" ON public.tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own tasks update" ON public.tasks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own tasks delete" ON public.tasks FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.task_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text NOT NULL,
  kind text NOT NULL DEFAULT 'progress',
  status text,
  progress integer,
  source text NOT NULL DEFAULT 'dashboard',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_updates_task_idx ON public.task_updates(task_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.task_updates TO authenticated;
GRANT ALL ON public.task_updates TO service_role;
ALTER TABLE public.task_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own updates select" ON public.task_updates FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own updates insert" ON public.task_updates FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid()));
CREATE POLICY "own updates delete" ON public.task_updates FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.mcp_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Instinct',
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX mcp_credentials_user_idx ON public.mcp_credentials(user_id);
GRANT SELECT ON public.mcp_credentials TO authenticated;
GRANT ALL ON public.mcp_credentials TO service_role;
ALTER TABLE public.mcp_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own creds select" ON public.mcp_credentials FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_task() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    NEW.progress := 100;
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tasks_touch BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.touch_task();

ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_updates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mcp_credentials;