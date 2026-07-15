import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, History as HistoryIcon, CheckCircle2, Circle, Clock } from "lucide-react";
import { CATEGORY_LABELS, WEEKDAY_LABELS } from "@/lib/task-utils";
import type { TaskRow } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function HistoryPage() {
  const [date, setDate] = useState<string>(todayISO());

  const tasksQ = useQuery({
    queryKey: ["tasks", "all-history"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").order("category").order("weekday").order("position");
      if (error) throw error;
      return (data ?? []) as TaskRow[];
    },
  });

  const compsQ = useQuery({
    queryKey: ["completions", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("task_completions").select("*").eq("completion_date", date);
      if (error) throw error;
      return data ?? [];
    },
  });

  const statusById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of compsQ.data ?? []) m.set(c.task_id as string, c.status as string);
    return m;
  }, [compsQ.data]);

  const jsDow = new Date(date + "T00:00:00").getDay();
  const wd = jsDow === 0 ? 0 : jsDow;

  const dueThatDay = useMemo(() => {
    const tasks = tasksQ.data ?? [];
    if (wd === 0) return [] as TaskRow[];
    return tasks.filter((t) => {
      if (!t.active) {
        // still show completed ones on that date even if archived
        return statusById.has(t.id);
      }
      if (t.category === "diaria") return true;
      if (t.category === "semanal") return t.weekday === wd;
      return true;
    });
  }, [tasksQ.data, wd, statusById]);

  const grouped = useMemo(() => {
    const g: Record<string, TaskRow[]> = {};
    for (const t of dueThatDay) {
      const key = CATEGORY_LABELS[t.category] ?? t.category;
      (g[key] ??= []).push(t);
    }
    return g;
  }, [dueThatDay]);

  const stats = {
    total: dueThatDay.length,
    done: dueThatDay.filter((t) => statusById.get(t.id) === "done").length,
    inProgress: dueThatDay.filter((t) => statusById.get(t.id) === "in_progress").length,
    pending: dueThatDay.filter((t) => !statusById.has(t.id)).length,
  };

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-border sticky top-0 backdrop-blur bg-background/70 z-10">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Link>
          </Button>
          <div className="flex items-center gap-2">
            <HistoryIcon className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-base font-semibold">Histórico de tarefas</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Data:</label>
            <Input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="w-[170px]"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <section className="card-elevated rounded-xl p-4">
          <p className="text-sm text-muted-foreground capitalize">{dateLabel}</p>
          {wd === 0 ? (
            <p className="text-sm mt-2">Domingo — nenhuma tarefa programada.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <Stat label="Programadas" value={stats.total} />
              <Stat label="Concluídas" value={stats.done} tone="green" />
              <Stat label="Em andamento" value={stats.inProgress} tone="yellow" />
              <Stat label="Não feitas" value={stats.pending} tone="red" />
            </div>
          )}
        </section>

        {Object.keys(grouped).length === 0 && wd !== 0 && (
          <div className="card-elevated rounded-xl p-6 text-center text-muted-foreground text-sm">
            Nenhuma tarefa registrada neste dia.
          </div>
        )}

        {Object.entries(grouped).map(([groupKey, list]) => (
          <section key={groupKey} className="card-elevated rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-3">
              {groupKey}
              {groupKey === CATEGORY_LABELS.semanal && wd !== 0 && (
                <span className="ml-2 text-xs uppercase tracking-wider text-muted-foreground">
                  {WEEKDAY_LABELS[wd]}
                </span>
              )}
            </h2>
            <ul className="space-y-2">
              {list.map((t) => {
                const s = statusById.get(t.id);
                const icon = s === "done"
                  ? <CheckCircle2 className="h-4 w-4 text-status-green" />
                  : s === "in_progress"
                  ? <Clock className="h-4 w-4 text-status-yellow" />
                  : <Circle className="h-4 w-4 text-status-red" />;
                const label = s === "done" ? "Concluída" : s === "in_progress" ? "Em andamento" : "Não feita";
                const tone = s === "done" ? "text-status-green" : s === "in_progress" ? "text-status-yellow" : "text-status-red";
                return (
                  <li key={t.id} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                    {icon}
                    <span className="text-sm flex-1">{t.title}</span>
                    <span className={`text-xs font-medium uppercase tracking-wider ${tone}`}>{label}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "green" | "yellow" | "red" }) {
  const toneCls = tone === "green" ? "text-status-green" : tone === "yellow" ? "text-status-yellow" : tone === "red" ? "text-status-red" : "text-foreground";
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneCls}`}>{value}</div>
    </div>
  );
}
