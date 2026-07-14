import { supabase } from "@/integrations/supabase/client";

export async function logAudit(action: string, entity: string, entity_id?: string | null, details?: Record<string, unknown>) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("audit_log").insert({
    user_id: u.user.id,
    user_email: u.user.email ?? null,
    action,
    entity,
    entity_id: entity_id ?? null,
    details: (details as never) ?? null,
  });
}
