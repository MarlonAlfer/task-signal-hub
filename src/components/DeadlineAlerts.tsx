import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playAmbulanceSiren } from "@/lib/siren";
import { useTranslation } from "react-i18next";
import { currentLocale } from "@/i18n";

type Deadline = {
  id: string;
  title: string;
  started_on: string;
  due_on: string;
  notes: string | null;
  completed: boolean;
  acknowledged_dates: string[] | null;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DeadlineAlerts() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  const q = useQuery({
    queryKey: ["deadlines", "alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deadlines" as never)
        .select("*")
        .eq("completed", false)
        .in("due_on", [today, tomorrow]);
      if (error) throw error;
      return (data ?? []) as unknown as Deadline[];
    },
    refetchInterval: 60_000,
  });

  const pending = useMemo(
    () => (q.data ?? []).filter((d) => !(d.acknowledged_dates ?? []).includes(today)),
    [q.data, today],
  );

  const sirenPlayed = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const d of pending) {
      if (!sirenPlayed.current.has(d.id)) {
        sirenPlayed.current.add(d.id);
        playAmbulanceSiren(4);
      }
    }
  }, [pending]);

  const acknowledge = useMutation({
    mutationFn: async (d: Deadline) => {
      const acks = Array.from(new Set([...(d.acknowledged_dates ?? []), today]));
      const { error } = await supabase
        .from("deadlines" as never)
        .update({ acknowledged_dates: acks } as never)
        .eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deadlines"] }),
  });

  if (pending.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 max-w-sm">
      {pending.map((d) => {
        const isToday = d.due_on === today;
        return (
          <div
            key={d.id}
            role="alert"
            className="rounded-xl border-2 border-status-red bg-background/95 backdrop-blur-lg shadow-2xl shadow-status-red/40 p-4 animate-pulse-slow"
            style={{ animation: "pulse 1.4s ease-in-out infinite" }}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-status-red shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-sm leading-snug">
                  {t("deadlines.alertText", { title: d.title })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isToday ? t("deadlines.dueToday") : t("deadlines.dueTomorrow")}
                  {" • "}
                  {new Date(d.due_on + "T00:00:00").toLocaleDateString(currentLocale())}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => acknowledge.mutate(d)}
                title={t("common.acknowledge")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => acknowledge.mutate(d)}>
                {t("common.acknowledge")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => playAmbulanceSiren(3)}>
                {t("deadlines.playAgain")}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
