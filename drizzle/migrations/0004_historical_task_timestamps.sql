ALTER TABLE public.tasks DISABLE TRIGGER tasks_touch;

ALTER TABLE public.tasks
  ADD COLUMN initiated_at timestamptz DEFAULT now(),
  ADD COLUMN started_at timestamptz,
  ADD COLUMN last_activity_at timestamptz,
  ADD COLUMN timestamp_notes text;

UPDATE public.tasks SET
  initiated_at = CASE WHEN source = 'dashboard' THEN created_at ELSE NULL END,
  last_activity_at = CASE WHEN source = 'dashboard' THEN updated_at ELSE NULL END,
  started_at = NULL;

ALTER TABLE public.tasks
  ADD COLUMN sort_initiated_at timestamptz GENERATED ALWAYS AS (COALESCE(initiated_at, created_at)) STORED,
  ADD COLUMN sort_activity_at timestamptz GENERATED ALWAYS AS (COALESCE(last_activity_at, completed_at, started_at, initiated_at, created_at)) STORED;

COMMENT ON COLUMN public.tasks.created_at IS 'When this record was created/imported in Task Compass (not when the task actually began).';
COMMENT ON COLUMN public.tasks.initiated_at IS 'When the task was actually requested/initiated. NULL = unknown.';
COMMENT ON COLUMN public.tasks.started_at IS 'When work actually started. NULL = unknown or not started.';
COMMENT ON COLUMN public.tasks.last_activity_at IS 'When the latest real activity happened. NULL = unknown.';

ALTER TABLE public.tasks ENABLE TRIGGER tasks_touch;

CREATE INDEX IF NOT EXISTS tasks_user_sort_activity_idx ON public.tasks (user_id, sort_activity_at DESC);
CREATE INDEX IF NOT EXISTS tasks_user_sort_initiated_idx ON public.tasks (user_id, sort_initiated_at DESC);

ALTER TABLE public.task_updates ADD COLUMN occurred_at timestamptz;
UPDATE public.task_updates SET occurred_at = created_at WHERE source = 'dashboard';
ALTER TABLE public.task_updates ADD COLUMN effective_at timestamptz GENERATED ALWAYS AS (COALESCE(occurred_at, created_at)) STORED;
COMMENT ON COLUMN public.task_updates.created_at IS 'When this entry was recorded/imported in Task Compass.';
COMMENT ON COLUMN public.task_updates.occurred_at IS 'When the event actually happened. NULL = unknown.';
CREATE INDEX IF NOT EXISTS task_updates_task_effective_idx ON public.task_updates (task_id, effective_at);
CREATE INDEX IF NOT EXISTS task_updates_user_effective_idx ON public.task_updates (user_id, effective_at DESC);

CREATE OR REPLACE FUNCTION public.touch_task() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'completed' THEN
      NEW.progress := 100;
      IF NEW.source <> 'instinct' THEN NEW.completed_at := COALESCE(NEW.completed_at, now()); END IF;
    ELSE
      NEW.completed_at := NULL;
    END IF;
    IF NEW.source <> 'instinct' THEN
      IF NEW.status = 'in_progress' THEN NEW.started_at := COALESCE(NEW.started_at, now()); END IF;
      NEW.last_activity_at := COALESCE(NEW.last_activity_at, now());
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    NEW.progress := 100;
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
  END IF;
  IF NEW.status = 'in_progress' AND OLD.status IS DISTINCT FROM 'in_progress' AND NEW.started_at IS NULL AND OLD.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;
  IF NEW.last_activity_at IS NOT DISTINCT FROM OLD.last_activity_at AND (
       NEW.status IS DISTINCT FROM OLD.status OR NEW.progress IS DISTINCT FROM OLD.progress
       OR NEW.current_step IS DISTINCT FROM OLD.current_step OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.result IS DISTINCT FROM OLD.result) THEN
    NEW.last_activity_at := now();
  END IF;
  RETURN NEW;
END $$;