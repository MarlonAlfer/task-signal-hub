import { useRoles } from "@/hooks/useRoles";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldAlert, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

export function PendingGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { data: roles = [], isLoading } = useRoles();

  if (isLoading) return <>{children}</>;

  const isPending = roles.length === 0 || (roles.includes("pending") && !roles.some((r) => r === "admin" || r === "user" || r === "visitor"));

  if (!isPending) return <>{children}</>;

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-40"
        style={{
          backdropFilter: "blur(24px) saturate(120%)",
          WebkitBackdropFilter: "blur(24px) saturate(120%)",
          background: "rgba(15, 20, 32, 0.55)",
        }}
      >
        <div className="absolute inset-0 select-none opacity-40">{children}</div>
      </div>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-border bg-background/90 backdrop-blur-md p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-status-yellow/15 text-status-yellow">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold mb-2">{t("pending.title")}</h2>
          <p className="text-sm text-muted-foreground mb-5">{t("pending.body")}</p>
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/auth";
            }}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {t("common.signOut")}
          </Button>
        </div>
      </div>
    </div>
  );
}
