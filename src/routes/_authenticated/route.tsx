import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { BackgroundMusic } from "@/components/BackgroundMusic";
import { PendingGate } from "@/components/PendingGate";
import { DeadlineAlerts } from "@/components/DeadlineAlerts";

function AuthenticatedLayout() {
  useRealtimeSync();
  return (
    <PendingGate>
      <Outlet />
      <BackgroundMusic />
      <DeadlineAlerts />
    </PendingGate>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // "Keep login saved" off → forget the session once the browser session ends.
    try {
      if (
        localStorage.getItem("domusliv-remember") === "0" &&
        !sessionStorage.getItem("domusliv-session-active")
      ) {
        await supabase.auth.signOut();
        throw redirect({ to: "/auth" });
      }
      sessionStorage.setItem("domusliv-session-active", "1");
    } catch (e) {
      if (e instanceof Error && "to" in e === false) {
        // storage unavailable — continue without the remember check
      }
      if (typeof e === "object" && e !== null && "to" in e) throw e;
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});
