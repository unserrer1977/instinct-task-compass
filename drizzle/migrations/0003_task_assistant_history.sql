CREATE TABLE public.assistant_topics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL DEFAULT auth.uid(), title text NOT NULL, task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.assistant_topics TO authenticated;
GRANT ALL ON public.assistant_topics TO service_role;
ALTER TABLE public.assistant_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own assistant topics" ON public.assistant_topics FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id AND (task_id IS NULL OR EXISTS(SELECT 1 FROM public.tasks WHERE id=task_id AND user_id=auth.uid())));
CREATE TABLE public.assistant_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL DEFAULT auth.uid(), message_id text NOT NULL, topic_id uuid, message jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,message_id), FOREIGN KEY(topic_id,user_id) REFERENCES public.assistant_topics(id,user_id) ON DELETE CASCADE
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.assistant_messages TO authenticated;
GRANT ALL ON public.assistant_messages TO service_role;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own assistant messages" ON public.assistant_messages FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE INDEX assistant_messages_user_time ON public.assistant_messages(user_id,created_at);
CREATE TABLE public.assistant_access_state (
 user_id uuid PRIMARY KEY DEFAULT auth.uid(), denied boolean NOT NULL DEFAULT false, reason text, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE ON public.assistant_access_state TO authenticated;
GRANT ALL ON public.assistant_access_state TO service_role;
ALTER TABLE public.assistant_access_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own assistant access state" ON public.assistant_access_state FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);