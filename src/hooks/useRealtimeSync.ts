import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to Postgres changes on core tables and invalidates
 * matching React Query caches so every open screen updates live.
 */
export function useRealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("workpulse-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["tasks"] });
        qc.invalidateQueries({ queryKey: ["admin-tasks"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "task_completions" }, () => {
        qc.invalidateQueries({ queryKey: ["completions"] });
        qc.invalidateQueries({ queryKey: ["week-pending"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        qc.invalidateQueries({ queryKey: ["profile"] });
        qc.invalidateQueries({ queryKey: ["profiles"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => {
        qc.invalidateQueries({ queryKey: ["my-roles"] });
        qc.invalidateQueries({ queryKey: ["user-roles"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
