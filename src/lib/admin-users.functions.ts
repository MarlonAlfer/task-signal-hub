import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input?.userId || typeof input.userId !== "string") {
      throw new Error("userId obrigatório");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId: callerId } = context;

    // Verify caller is admin (RLS-scoped query as the caller)
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    if (data.userId === callerId) {
      throw new Error("Você não pode excluir sua própria conta.");
    }

    // Fetch target email for audit before deletion
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (delErr) throw new Error(delErr.message);

    // Audit log (trigger will overwrite user_id/user_email with caller identity)
    await supabase.from("audit_log").insert({
      user_id: callerId,
      action: "user_delete",
      entity: "auth.users",
      entity_id: data.userId,
      details: { target_email: targetProfile?.email ?? null } as never,
    });

    return { ok: true };
  });
