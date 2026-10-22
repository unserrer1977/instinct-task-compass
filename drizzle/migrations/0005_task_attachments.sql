CREATE TABLE public.task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL UNIQUE,
  sha256 text NOT NULL,
  description text,
  source text NOT NULL DEFAULT 'dashboard',
  occurred_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, sha256)
);
CREATE INDEX task_attachments_task_idx ON public.task_attachments(task_id);
GRANT SELECT, INSERT, DELETE ON public.task_attachments TO authenticated;
GRANT ALL ON public.task_attachments TO service_role;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attachments select" ON public.task_attachments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own attachments insert" ON public.task_attachments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid()));
CREATE POLICY "own attachments delete" ON public.task_attachments FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "own task files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own task files insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own task files delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'task-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

ALTER PUBLICATION supabase_realtime ADD TABLE public.task_attachments;