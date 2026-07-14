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
import { Activity, LogOut, Shield, ClipboardList, AlertTriangle, CalendarDays } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

  // Split tasks: highlighted (daily + today's weekly) vs other (quinzenal/mensal/semestral)
  const highlightedTasks = useMemo(
    () => dueToday.filter((t) => t.category === "diaria" || t.category === "semanal"),
    [dueToday]
  );
  const otherTasks = useMemo(
    () => tasks.filter((t) => t.category === "quinzenal" || t.category === "mensal" || t.category === "semestral"),
    [tasks]
  );

  const highlightGrouped = useMemo(() => {
    const g: Record<string, TaskRow[]> = {};
    for (const t of highlightedTasks) {
      const key = t.category === "diaria" ? CATEGORY_LABELS.diaria : CATEGORY_LABELS.semanal;
      (g[key] ??= []).push(t);
    }
    return g;
  }, [highlightedTasks]);

  const otherGrouped = useMemo(() => {
    const g: Record<string, TaskRow[]> = {};
    for (const t of otherTasks) {
      const key = CATEGORY_LABELS[t.category];
      (g[key] ??= []).push(t);
    }
    return g;
  }, [otherTasks]);

  // Monthly floating alert — first business day of the month, until acknowledged
  const [monthAlertOpen, setMonthAlertOpen] = useState(false);
  useEffect(() => {
    if (!tasksQ.data) return;
    if (typeof window === "undefined") return;
    if (!isFirstBusinessDayOfMonth()) return;
    const now = new Date();
    const key = `wp-month-alert-${now.getFullYear()}-${now.getMonth() + 1}`;
    if (localStorage.getItem(key)) return;
    const pendingMensal = otherTasks.filter(
      (t) => t.category === "mensal" && (statusById.get(t.id) ?? "pending") !== "done"
    );
    if (pendingMensal.length > 0) setMonthAlertOpen(true);
  }, [tasksQ.data, otherTasks, statusById]);

  function ackMonthAlert() {
    const now = new Date();
    const key = `wp-month-alert-${now.getFullYear()}-${now.getMonth() + 1}`;
    if (typeof window !== "undefined") localStorage.setItem(key, "1");
    setMonthAlertOpen(false);
  }


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
  const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  // Preview tasks for another weekday
  const [previewWd, setPreviewWd] = useState<string>("");
  const previewTasks = useMemo(() => {
    if (!previewWd) return [];
    const n = Number(previewWd);
    return tasks.filter((t) => t.category === "diaria" || (t.category === "semanal" && t.weekday === n));
  }, [previewWd, tasks]);
  const previewGrouped = useMemo(() => {
    const g: Record<string, TaskRow[]> = {};
    for (const t of previewTasks) {
      const key = t.group_label ?? "Geral";
      (g[key] ??= []).push(t);
    }
    return g;
  }, [previewTasks]);

  return (
    <div className="min-h-screen relative">
      {/* Background progress ring — sofisticated, semi-transparent */}
      <div aria-hidden className="pointer-events-none fixed inset-0 flex items-center justify-center z-0 overflow-hidden">
        <div className="relative opacity-[0.07] blur-[0.5px]">
          <svg width="640" height="640" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="88" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted-foreground" />
            <circle
              cx="100" cy="100" r="88" fill="none"
              stroke="currentColor" strokeWidth="10" strokeLinecap="round"
              className={pct === 100 ? "text-status-green" : pct >= 50 ? "text-status-yellow" : "text-status-red"}
              strokeDasharray={`${(pct / 100) * 2 * Math.PI * 88} ${2 * Math.PI * 88}`}
              transform="rotate(-90 100 100)"
            />
            <text x="100" y="108" textAnchor="middle" fontSize="42" fontWeight="800" fill="currentColor" className="text-foreground">
              {pct}%
            </text>
          </svg>
        </div>
      </div>
      <div className="relative z-[1]">

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

        {/* Preview de tarefas de outro dia da semana */}
        <section className="card-elevated rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Ver tarefas de outro dia</h2>
            <div className="ml-auto min-w-[200px]">
              <Select value={previewWd} onValueChange={setPreviewWd}>
                <SelectTrigger><SelectValue placeholder="Selecionar dia da semana" /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5,6].map((n) => (
                    <SelectItem key={n} value={String(n)}>{WEEKDAY_LABELS[n]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {previewWd && (
            <div className="mt-4 space-y-3">
              {Object.keys(previewGrouped).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma tarefa programada para {WEEKDAY_LABELS[Number(previewWd)]}.</p>
              ) : (
                Object.entries(previewGrouped).map(([sub, list]) => (
                  <div key={sub}>
                    {sub !== "Geral" && <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{sub}</h3>}
                    <ul className="text-sm space-y-1">
                      {list.map((t) => (
                        <li key={t.id} className="flex items-start gap-2 text-muted-foreground">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-status-yellow shrink-0" />
                          <span>{t.title}</span>
                          {t.category === "diaria" && <Badge variant="outline" className="ml-1 text-[10px]">diária</Badge>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          )}
        </section>


        {wd === 0 && (
          <div className="card-elevated rounded-lg p-6 text-center">
            <p className="text-muted-foreground">Hoje é domingo — nenhuma tarefa está programada. Aproveite o descanso!</p>
          </div>
        )}

        {Object.keys(highlightGrouped).length === 0 && wd !== 0 && !tasksQ.isLoading && (
          <div className="card-elevated rounded-lg p-6 text-center text-muted-foreground">
            Nenhuma tarefa para hoje.
          </div>
        )}

        {/* Destaque: diárias + dia da semana */}
        {Object.entries(highlightGrouped).map(([groupKey, list]) => {
          const bySub = list.reduce<Record<string, TaskRow[]>>((acc, t) => {
            const k = t.group_label ?? "Geral";
            (acc[k] ??= []).push(t);
            return acc;
          }, {});
          return (
            <section key={groupKey} className="card-elevated rounded-xl p-5 border-l-4 border-status-yellow">
              <div className="mb-4">
                <h2 className="text-lg font-semibold leading-tight">{groupKey}</h2>
                {groupKey === CATEGORY_LABELS.semanal && (
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{WEEKDAY_LABELS[wd]}</p>
                )}
              </div>
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

        {/* Quadro menor: outras periodicidades */}
        {Object.keys(otherGrouped).length > 0 && (
          <section className="card-elevated rounded-xl p-4 opacity-90">
            <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Outras tarefas periódicas</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {Object.entries(otherGrouped).map(([groupKey, list]) => (
                <div key={groupKey} className="rounded-lg border border-border p-3">
                  <h3 className="text-xs font-semibold mb-2">{groupKey}</h3>
                  <ul className="space-y-1 text-xs">
                    {list.map((t) => {
                      const s = statusById.get(t.id) ?? "pending";
                      const tone = s === "done" ? "text-status-green line-through" : s === "in_progress" ? "text-status-yellow" : "text-muted-foreground";
                      return (
                        <li key={t.id} className="flex items-start gap-2">
                          <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${s === "done" ? "bg-status-green" : s === "in_progress" ? "bg-status-yellow" : "bg-status-red"}`} />
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => cycle(t.id)}
                            onDoubleClick={() => complete(t.id)}
                            className={`text-left ${tone} disabled:cursor-not-allowed`}
                          >
                            {t.title}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}


        <p className="text-xs text-muted-foreground text-center pt-4">
          Um clique alterna <span className="text-status-yellow">Em andamento</span>. Dois cliques marcam como <span className="text-status-green">Concluída</span>.
        </p>
      </main>

      {/* Floating monthly alert — first business day of the month */}
      {monthAlertOpen && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm card-elevated rounded-xl border-l-4 border-status-red p-4 shadow-2xl animate-in slide-in-from-bottom-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-status-red shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-sm mb-1">Tarefas mensais pendentes</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Hoje é o primeiro dia útil do mês. Existem tarefas mensais a realizar:
              </p>
              <ul className="text-xs space-y-1 mb-3 max-h-32 overflow-auto">
                {otherTasks
                  .filter((t) => t.category === "mensal" && (statusById.get(t.id) ?? "pending") !== "done")
                  .slice(0, 6)
                  .map((t) => (
                    <li key={t.id} className="text-muted-foreground">• {t.title}</li>
                  ))}
              </ul>
              <Button size="sm" onClick={ackMonthAlert} className="w-full">Estou ciente</Button>
            </div>
          </div>
        </div>
      )}


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
