import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useMcpCredential() {
  return useQuery({
    queryKey: ["mcp_credential"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mcp_credentials")
        .select("id,name,token_prefix,created_at,last_used_at,revoked_at")
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });
}
