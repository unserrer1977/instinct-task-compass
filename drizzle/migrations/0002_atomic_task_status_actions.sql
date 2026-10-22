CREATE OR REPLACE FUNCTION public.change_task_status(p_ids uuid[], p_status text DEFAULT NULL, p_restore jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_before jsonb; v_after jsonb; v_count integer; v_expected integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF p_ids IS NULL OR cardinality(p_ids)=0 OR array_position(p_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Choose tasks'; END IF;
 SELECT count(DISTINCT id) INTO v_expected FROM unnest(p_ids) id;
 IF p_restore IS NULL AND (p_status IS NULL OR p_status NOT IN ('queued','scheduled','in_progress','needs_review','completed','cancelled')) THEN RAISE EXCEPTION 'Invalid status'; END IF;
 PERFORM id FROM public.tasks WHERE id=ANY(p_ids) AND user_id=auth.uid() ORDER BY id FOR UPDATE;
 SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id),count(*) INTO v_before,v_count FROM public.tasks t WHERE id=ANY(p_ids) AND user_id=auth.uid();
 IF v_count<>v_expected THEN RAISE EXCEPTION 'Some tasks are unavailable; nothing changed'; END IF;
 IF p_restore IS NULL THEN
  UPDATE public.tasks SET status=p_status, progress=CASE WHEN p_status='completed' THEN 100 WHEN status='completed' THEN 0 ELSE progress END, completed_at=CASE WHEN p_status='completed' THEN COALESCE(completed_at,now()) ELSE NULL END WHERE id=ANY(p_ids) AND user_id=auth.uid();
 ELSE
  IF jsonb_typeof(p_restore)<>'array' OR jsonb_array_length(p_restore)<>v_expected THEN RAISE EXCEPTION 'Invalid undo'; END IF;
  SELECT count(DISTINCT t.id) INTO v_count FROM public.tasks t JOIN jsonb_to_recordset(p_restore) AS r(id uuid,status text,progress integer,completed_at timestamptz,expected_updated_at timestamptz) ON r.id=t.id WHERE t.id=ANY(p_ids) AND t.user_id=auth.uid() AND t.updated_at=r.expected_updated_at AND r.status IN ('queued','scheduled','in_progress','needs_review','completed','cancelled') AND r.progress BETWEEN 0 AND 100;
  IF v_count<>v_expected THEN RAISE EXCEPTION 'Tasks changed since this action; Undo cannot overwrite newer updates'; END IF;
  UPDATE public.tasks t SET status=r.status,progress=r.progress,completed_at=r.completed_at FROM jsonb_to_recordset(p_restore) AS r(id uuid,status text,progress integer,completed_at timestamptz) WHERE t.id=r.id AND t.id=ANY(p_ids) AND t.user_id=auth.uid();
 END IF;
 SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) INTO v_after FROM public.tasks t WHERE id=ANY(p_ids) AND user_id=auth.uid();
 INSERT INTO public.task_updates(task_id,user_id,kind,message,status,progress,source)
 SELECT t.id,auth.uid(),CASE WHEN t.status='completed' THEN 'completed' ELSE 'status' END,CASE WHEN p_restore IS NULL THEN 'Status changed from dashboard to '||t.status ELSE 'Undid dashboard status change — restored '||t.status END,t.status,t.progress,'dashboard' FROM public.tasks t WHERE t.id=ANY(p_ids) AND t.user_id=auth.uid();
 RETURN jsonb_build_object('before',v_before,'after',v_after);
END $$;
REVOKE ALL ON FUNCTION public.change_task_status(uuid[],text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_task_status(uuid[],text,jsonb) TO authenticated;