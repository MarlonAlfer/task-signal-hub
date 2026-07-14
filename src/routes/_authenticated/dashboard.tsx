import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TrafficTaskItem } from "@/components/TrafficTaskItem";
import { WEEKDAY_LABELS, CATEGORY_LABELS, todayISO, todayWeekday, isFriday, startOfWeekISO, isTaskDueToday, isFirstBusinessDayOfMonth } from "@/lib/task-utils";
import { useRoles, highestRole } from "@/hooks/useRoles";
import { logAudit } from "@/lib/audit";
import type { CompletionStatus, TaskRow } from "@/lib/types";
import { Activity, LogOut, Shield, ClipboardList, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: roles = [] } = useRoles();
  const role = highestRole(roles);
  const canEdit = role === "admin" || role === "user";

  const today = todayISO();
  const wd = todayWeekday();

  const tasksQ = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("active", true).order("category").order("weekday").order("position");
      if (error) throw error;
      return (data ?? []) as TaskRow[];
    },
  });

  const compsQ = useQuery({
    queryKey: ["completions", today],
    queryFn: async () => {
      const { data, error } = await supabase.from("task_completions").select("*").eq("completion_date", today);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Weekly pending (Mon..now) for the Friday alert
  const weekPendingQ = useQuery({
    queryKey: ["week-pending", startOfWeekISO()],
    queryFn: async () => {
      const start = startOfWeekISO();
      const { data, error } = await supabase.from("task_completions").select("*").gte("completion_date", start).lte("completion_date", today);
      if (error) throw error;
      return data ?? [];
    },
    enabled: isFriday(),
  });

  const statusById = useMemo(() => {
    const map = new Map<string, CompletionStatus>();
    for (const c of compsQ.data ?? []) map.set(c.task_id as string, c.status as CompletionStatus);
    return map;
  }, [compsQ.data]);

  const tasks = tasksQ.data ?? [];
  const dueToday = useMemo(() => tasks.filter((t) => isTaskDueToday(t)), [tasks]);
  const pendingToday = useMemo(() => dueToday.filter((t) => (statusById.get(t.id) ?? "pending") !== "done"), [dueToday, statusById]);

  // Open-of-day dialog (once per day per browser)
  const [openDialog, setOpenDialog] = useState(false);
  useEffect(() => {
    if (!tasksQ.data) return;
    const key = `wp-open-${today}`;
    if (typeof window !== "undefined" && !localStorage.getItem(key) && dueToday.length > 0) {
      setOpenDialog(true);
      localStorage.setItem(key, "1");
    }
  }, [tasksQ.data, today, dueToday.length]);

  // Weekly (Friday) alert once per week
  const [openWeekly, setOpenWeekly] = useState(false);
  useEffect(() => {
    if (!isFriday() || !weekPendingQ.data || !tasksQ.data) return;
    const key = `wp-friday-${startOfWeekISO()}`;
    if (typeof window !== "undefined" && !localStorage.getItem(key)) {
      setOpenWeekly(true);
      localStorage.setItem(key, "1");
    }
  }, [weekPendingQ.data, tasksQ.data]);

  // Warn on close about pending tasks
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (pendingToday.length > 0) {
        e.preventDefault();
        e.returnValue = `Você tem ${pendingToday.length} tarefa(s) pendente(s) hoje.`;
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [pendingToday.length]);

  async function setStatus(taskId: string, newStatus: CompletionStatus) {
    if (!canEdit) {
      toast.error("Visitantes não podem editar tarefas.");
      return;
    }
    const prev = statusById.get(taskId) ?? "pending";
    // optimistic update handled by refetch
    if (newStatus === "pending") {
      const { error } = await supabase.from("task_completions").delete().eq("task_id", taskId).eq("completion_date", today);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("task_completions").upsert(
        { task_id: taskId, completion_date: today, status: newStatus, updated_by: (await supabase.auth.getUser()).data.user?.id, updated_at: new Date().toISOString() },
        { onConflict: "task_id,completion_date" }
      );
      if (error) return toast.error(error.message);
    }
    await logAudit("task_status_change", "task_completions", taskId, { from: prev, to: newStatus, date: today });
    qc.invalidateQueries({ queryKey: ["completions", today] });
    qc.invalidateQueries({ queryKey: ["week-pending", startOfWeekISO()] });
  }

  function cycle(taskId: string) {
    const s = statusById.get(taskId) ?? "pending";
    if (s === "pending") setStatus(taskId, "in_progress");
    else if (s === "in_progress") setStatus(taskId, "pending");
    else setStatus(taskId, "pending");
  }

  function complete(taskId: string) {
    setStatus(taskId, "done");
  }

  // Group due-today tasks
  const grouped = useMemo(() => {
    const g: Record<string, TaskRow[]> = {};
    for (const t of dueToday) {
      const key =
        t.category === "diaria" ? CATEGORY_LABELS.diaria
        : t.category === "semanal" ? `${CATEGORY_LABELS.semanal} · ${WEEKDAY_LABELS[t.weekday ?? 0] ?? ""}`
        : CATEGORY_LABELS[t.category];
      (g[key] ??= []).push(t);
    }
    return g;
  }, [dueToday]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const stats = {
    total: dueToday.length,
    done: dueToday.filter((t) => statusById.get(t.id) === "done").length,
    inProgress: dueToday.filter((t) => statusById.get(t.id) === "in_progress").length,
    pending: dueToday.filter((t) => (statusById.get(t.id) ?? "pending") === "pending").length,
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border sticky top-0 backdrop-blur bg-background/70 z-10">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="grid grid-cols-1 gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-status-red" />
              <span className="h-2.5 w-2.5 rounded-full bg-status-yellow" />
              <span className="h-2.5 w-2.5 rounded-full bg-status-green" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">WorkPulse</h1>
              <p className="text-xs text-muted-foreground">
                {wd === 0 ? "Domingo — sem tarefas programadas" : WEEKDAY_LABELS[wd]}
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="uppercase text-xs">
              {role === "admin" ? "Administrador" : role === "user" ? "Usuário" : "Visitante"}
            </Badge>
            {role === "admin" && (
              <Button asChild variant="secondary" size="sm">
                <Link to="/admin"><Shield className="h-4 w-4 mr-2" />Admin</Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Tarefas de hoje" value={stats.total} icon={<ClipboardList className="h-4 w-4" />} />
          <StatCard label="Pendentes" value={stats.pending} tone="red" />
          <StatCard label="Em andamento" value={stats.inProgress} tone="yellow" />
          <StatCard label="Concluídas" value={stats.done} tone="green" />
        </section>

        {wd === 0 && (
          <div className="card-elevated rounded-lg p-6 text-center">
            <p className="text-muted-foreground">Hoje é domingo — nenhuma tarefa está programada. Aproveite o descanso!</p>
          </div>
        )}

        {Object.keys(grouped).length === 0 && wd !== 0 && !tasksQ.isLoading && (
          <div className="card-elevated rounded-lg p-6 text-center text-muted-foreground">
            Nenhuma tarefa para hoje.
          </div>
        )}

        {Object.entries(grouped).map(([groupKey, list]) => {
          const bySub = list.reduce<Record<string, TaskRow[]>>((acc, t) => {
            const k = t.group_label ?? "Geral";
            (acc[k] ??= []).push(t);
            return acc;
          }, {});
          return (
            <section key={groupKey} className="card-elevated rounded-xl p-5">
              <h2 className="text-lg font-semibold mb-4">{groupKey}</h2>
              <div className="space-y-4">
                {Object.entries(bySub).map(([sub, tasksSub]) => (
                  <div key={sub}>
                    {sub !== "Geral" && <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{sub}</h3>}
                    <div className="space-y-2">
                      {tasksSub.map((t) => (
                        <TrafficTaskItem
                          key={t.id}
                          title={t.title}
                          group={null}
                          status={statusById.get(t.id) ?? "pending"}
                          disabled={!canEdit}
                          onCycle={() => cycle(t.id)}
                          onComplete={() => complete(t.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <p className="text-xs text-muted-foreground text-center pt-4">
          Um clique alterna <span className="text-status-yellow">Em andamento</span>. Dois cliques marcam como <span className="text-status-green">Concluída</span>.
        </p>
      </main>

      {/* Opening dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-status-yellow" /> Tarefas de hoje</DialogTitle>
            <DialogDescription>
              {wd === 0 ? "Hoje é domingo — sem tarefas programadas."
                : `Você tem ${dueToday.length} tarefa(s) programada(s) para hoje (${WEEKDAY_LABELS[wd]}).`}
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-64 overflow-auto space-y-1 text-sm">
            {dueToday.slice(0, 12).map((t) => (
              <li key={t.id} className="text-muted-foreground">• {t.title}</li>
            ))}
            {dueToday.length > 12 && <li className="text-xs">+ {dueToday.length - 12} outras…</li>}
          </ul>
          <DialogFooter>
            <Button onClick={() => setOpenDialog(false)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Friday weekly alert */}
      <Dialog open={openWeekly} onOpenChange={setOpenWeekly}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-status-red"><AlertTriangle className="h-5 w-5" /> Pendências da semana</DialogTitle>
            <DialogDescription>Revisão de sexta-feira — verifique o que ficou em aberto nesta semana.</DialogDescription>
          </DialogHeader>
          <FridayPendingList tasks={tasks} completions={weekPendingQ.data ?? []} />
          <DialogFooter>
            <Button onClick={() => setOpenWeekly(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, tone, icon }: { label: string; value: number; tone?: "red"|"yellow"|"green"; icon?: React.ReactNode }) {
  const toneCls = tone === "red" ? "text-status-red" : tone === "yellow" ? "text-status-yellow" : tone === "green" ? "text-status-green" : "text-foreground";
  return (
    <div className="card-elevated rounded-lg p-4">
      <div className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className={`text-3xl font-bold mt-1 ${toneCls}`}>{value}</div>
    </div>
  );
}

function FridayPendingList({ tasks, completions }: { tasks: TaskRow[]; completions: { task_id: string; completion_date: string; status: string }[] }) {
  const doneKeys = new Set(completions.filter(c => c.status === "done").map(c => `${c.task_id}|${c.completion_date}`));
  const start = new Date(startOfWeekISO());
  const days: string[] = [];
  const today = new Date();
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0,10));
  }
  const pending: { day: string; title: string }[] = [];
  for (const day of days) {
    const jsDay = new Date(day).getDay();
    const wd = jsDay === 0 ? 0 : jsDay;
    if (wd === 0) continue;
    for (const t of tasks) {
      const due = isTaskDueTodayForDate(t, wd);
      if (!due) continue;
      if (!doneKeys.has(`${t.id}|${day}`)) pending.push({ day, title: t.title });
    }
  }
  if (pending.length === 0) return <p className="text-sm text-status-green">Nenhuma pendência esta semana. Bom trabalho!</p>;
  return (
    <ul className="max-h-72 overflow-auto space-y-1 text-sm">
      {pending.slice(0, 40).map((p, i) => (
        <li key={i} className="text-muted-foreground">
          <span className="text-status-red">●</span> {new Date(p.day).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })} — {p.title}
        </li>
      ))}
      {pending.length > 40 && <li className="text-xs">+ {pending.length - 40} outras…</li>}
    </ul>
  );
}

function isTaskDueTodayForDate(t: TaskRow, wd: number) {
  if (wd === 0) return false;
  if (t.category === "diaria") return true;
  if (t.category === "semanal") return t.weekday === wd;
  return true;
}
