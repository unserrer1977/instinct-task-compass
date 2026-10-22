GRANT INSERT, UPDATE ON public.mcp_credentials TO authenticated;
CREATE POLICY "own creds insert" ON public.mcp_credentials FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own creds update" ON public.mcp_credentials FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);