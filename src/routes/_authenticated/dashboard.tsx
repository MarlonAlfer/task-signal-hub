import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Activity, LogOut, Shield, ClipboardList, AlertTriangle, CalendarDays, ChevronDown, ChevronRight, UserCog, History, Volume2, Plus, Trash2, Sparkles } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { GroupNote } from "@/components/GroupNote";
import { playCompletionSound } from "@/lib/sound-effects";

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

  const extrasQ = useQuery({
    queryKey: ["extra-tasks", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("extra_tasks")
        .select("*")
        .eq("task_date", today)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const profileQ = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase.from("profiles").select("id, display_name, email").eq("id", u.user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (profileQ.data?.display_name) setProfileName(profileQ.data.display_name);
  }, [profileQ.data?.display_name]);

  async function saveProfile() {
    const name = profileName.trim();
    if (!name) return toast.error("Nome não pode ficar vazio.");
    setSavingProfile(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSavingProfile(false); return; }
    const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", u.user.id);
    setSavingProfile(false);
    if (error) return toast.error(error.message);
    toast.success("Nome atualizado.");
    qc.invalidateQueries({ queryKey: ["profile"] });
    setProfileOpen(false);
  }

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

  // Last "done" completion date for each monthly task
  const monthlyTaskIds = useMemo(
    () => tasks.filter((t) => t.category === "mensal").map((t) => t.id),
    [tasks]
  );
  const monthlyDoneQ = useQuery({
    queryKey: ["monthly-done", monthlyTaskIds.join(",")],
    queryFn: async () => {
      if (monthlyTaskIds.length === 0) return [] as { task_id: string; completion_date: string }[];
      const { data, error } = await supabase
        .from("task_completions")
        .select("task_id, completion_date, status")
        .in("task_id", monthlyTaskIds)
        .eq("status", "done")
        .order("completion_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { task_id: string; completion_date: string }[];
    },
    enabled: monthlyTaskIds.length > 0,
  });
  const monthlyLastDoneById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of monthlyDoneQ.data ?? []) {
      if (!map.has(c.task_id)) map.set(c.task_id, c.completion_date);
    }
    return map;
  }, [monthlyDoneQ.data]);

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

  // Congratulatory message when the last pending task of today is completed
  const [congratsOpen, setCongratsOpen] = useState(false);
  const prevPendingCountRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevPendingCountRef.current;
    prevPendingCountRef.current = pendingToday.length;
    if (prev === 1 && pendingToday.length === 0 && !congratsOpen) {
      setCongratsOpen(true);
    }
  }, [pendingToday.length, congratsOpen]);

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
    playCompletionSound();
    setStatus(taskId, "done");
  }

  // Extra ad-hoc tasks
  const [extraTitle, setExtraTitle] = useState("");
  const [addingExtra, setAddingExtra] = useState(false);
  const extras = extrasQ.data ?? [];
  const pendingExtras = useMemo(() => extras.filter((e) => e.status !== "done"), [extras]);

  async function addExtra() {
    const title = extraTitle.trim();
    if (!title) return;
    if (!canEdit) return toast.error("Visitantes não podem adicionar tarefas.");
    setAddingExtra(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("extra_tasks")
      .insert({ title, task_date: today, status: "in_progress", created_by: u.user?.id })
      .select()
      .single();
    setAddingExtra(false);
    if (error) return toast.error(error.message);
    setExtraTitle("");
    await logAudit("extra_task_create", "extra_tasks", data?.id ?? null, { title, date: today });
    qc.invalidateQueries({ queryKey: ["extra-tasks", today] });
  }

  async function setExtraStatus(id: string, newStatus: CompletionStatus) {
    if (!canEdit) return toast.error("Visitantes não podem editar tarefas.");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("extra_tasks")
      .update({ status: newStatus, updated_by: u.user?.id })
      .eq("id", id);
    if (error) return toast.error(error.message);
    await logAudit("extra_task_status_change", "extra_tasks", id, { to: newStatus });
    qc.invalidateQueries({ queryKey: ["extra-tasks", today] });
  }

  function cycleExtra(id: string, current: CompletionStatus) {
    if (current === "pending") setExtraStatus(id, "in_progress");
    else if (current === "in_progress") setExtraStatus(id, "pending");
    else setExtraStatus(id, "pending");
  }

  function completeExtra(id: string) {
    playCompletionSound();
    setExtraStatus(id, "done");
  }

  async function removeExtra(id: string) {
    if (!canEdit) return toast.error("Visitantes não podem excluir tarefas.");
    if (!confirm("Excluir esta tarefa extra?")) return;
    const { error } = await supabase.from("extra_tasks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await logAudit("extra_task_delete", "extra_tasks", id);
    qc.invalidateQueries({ queryKey: ["extra-tasks", today] });
  }

  // View a specific weekday's schedule (defaults to today; Sunday → Monday)
  const [viewWd, setViewWd] = useState<number>(wd === 0 ? 1 : wd);
  const isViewingToday = viewWd === wd;

  // Split tasks: highlighted (daily + selected weekday) vs other (quinzenal/mensal/semestral)
  const highlightedTasks = useMemo(
    () => tasks.filter((t) => t.active !== false && (t.category === "diaria" || (t.category === "semanal" && t.weekday === viewWd))),
    [tasks, viewWd]
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
  const pendingMensalList = useMemo(
    () => otherTasks.filter((t) => t.category === "mensal" && (statusById.get(t.id) ?? "pending") !== "done"),
    [otherTasks, statusById]
  );
  useEffect(() => {
    if (!tasksQ.data) return;
    if (typeof window === "undefined") return;
    if (!isFirstBusinessDayOfMonth()) return;
    const now = new Date();
    const key = `wp-month-alert-${now.getFullYear()}-${now.getMonth() + 1}`;
    if (localStorage.getItem(key)) return;
    if (pendingMensalList.length > 0) setMonthAlertOpen(true);
  }, [tasksQ.data, pendingMensalList]);

  // Play audible reminder for monthly pending tasks
  function playMonthlyAlertSound() {
    if (typeof window === "undefined") return;
    const count = pendingMensalList.length;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const notes = [880, 1175, 1568]; // A5, D6, G6 chime
        notes.forEach((freq, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "sine";
          o.frequency.value = freq;
          const t0 = ctx.currentTime + i * 0.22;
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(0.25, t0 + 0.03);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
          o.connect(g).connect(ctx.destination);
          o.start(t0);
          o.stop(t0 + 0.6);
        });
      }
    } catch { /* ignore */ }
    try {
      const synth = window.speechSynthesis;
      if (synth) {
        synth.cancel();
        const msg = new SpeechSynthesisUtterance(
          `Atenção. Hoje é o primeiro dia útil do mês. Você tem ${count} tarefa${count === 1 ? "" : "s"} mensal${count === 1 ? "" : "is"} pendente${count === 1 ? "" : "s"}.`
        );
        msg.lang = "pt-BR";
        msg.rate = 1;
        msg.pitch = 1;
        setTimeout(() => synth.speak(msg), 900);
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!monthAlertOpen) return;
    playMonthlyAlertSound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthAlertOpen]);



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

  // Default: all sections start closed. `opened[k] === true` means the user opened it.
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const isOpen = (k: string) => !!opened[k];
  const toggle = (k: string) => setOpened((o) => ({ ...o, [k]: !o[k] }));

  // Section status: red dot when there are pending items, green when all done.
  function SectionStatus({ pending, total }: { pending: number; total: number }) {
    if (total === 0) return null;
    const allDone = pending === 0;
    return (
      <span
        aria-label={allDone ? "Tudo concluído" : `${pending} pendente(s)`}
        title={allDone ? "Tudo concluído" : `${pending} pendente(s)`}
        className={`inline-block h-2.5 w-2.5 rounded-full ${allDone ? "bg-status-green shadow-glow-green" : "bg-status-red shadow-glow-red animate-pulse"}`}
      />
    );
  }


  return (
    <div className="min-h-screen relative">
      {/* Floating progress ring — 30% opacity, corner widget */}
      <div aria-hidden className="pointer-events-none fixed bottom-4 left-4 z-40 opacity-30">
        <div className="relative rounded-full bg-background/40 backdrop-blur-sm shadow-lg">
          <svg width="140" height="140" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="88" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted-foreground" />
            <circle
              cx="100" cy="100" r="88" fill="none"
              stroke="currentColor" strokeWidth="14" strokeLinecap="round"
              className={pct === 100 ? "text-status-green" : pct >= 50 ? "text-status-yellow" : "text-status-red"}
              strokeDasharray={`${(pct / 100) * 2 * Math.PI * 88} ${2 * Math.PI * 88}`}
              transform="rotate(-90 100 100)"
            />
            <text x="100" y="115" textAnchor="middle" fontSize="52" fontWeight="800" fill="currentColor" className="text-foreground">
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
              <h1 className="text-lg font-bold leading-tight">Domus Liv</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <span>{wd === 0 ? "Domingo — sem tarefas programadas" : WEEKDAY_LABELS[wd]}</span>
                <span className="inline-flex items-center rounded-full bg-status-green/15 text-status-green px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-status-green/30">Hoje</span>
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setProfileOpen(true)} className="max-w-[160px] truncate">
              <UserCog className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">{profileQ.data?.display_name ?? "Perfil"}</span>
            </Button>
            <Badge variant="outline" className="uppercase text-xs">
              {role === "admin" ? "Administrador" : role === "user" ? "Usuário" : "Visitante"}
            </Badge>
            <Button asChild variant="ghost" size="icon" title="Histórico" className="text-muted-foreground hover:text-foreground">
              <Link to="/history"><History className="h-4 w-4" /></Link>
            </Button>
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
        <section>
          <button
            type="button"
            onClick={() => toggle("stats")}
            className="flex items-center gap-2 mb-3 hover:opacity-80"
            aria-expanded={isOpen("stats")}
          >
            {isOpen("stats") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Resumo do dia</h2>
          </button>
          {isOpen("stats") && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Tarefas de hoje" value={stats.total} icon={<ClipboardList className="h-4 w-4" />} />
              <StatCard label="Pendentes" value={stats.pending} tone="red" />
              <StatCard label="Em andamento" value={stats.inProgress} tone="yellow" />
              <StatCard label="Concluídas" value={stats.done} tone="green" />
            </div>
          )}
        </section>

        {/* Seletor de dia da semana — visualizar / editar tarefas de outro dia */}
        <section className="card-elevated rounded-xl p-4 flex flex-wrap items-center gap-3">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-sm font-semibold">Ver / editar tarefas do dia</h2>
            <p className="text-[11px] text-muted-foreground">
              Selecione um dia para visualizar ou marcar tarefas. As alterações são registradas em <strong>hoje</strong>.
            </p>
          </div>
          <div className="min-w-[180px]">
            <Select value={String(viewWd)} onValueChange={(v) => setViewWd(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1,2,3,4,5,6].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    <span className="flex items-center gap-2">
                      {WEEKDAY_LABELS[n]}
                      {n === wd && <span className="rounded-full bg-status-green/20 text-status-green px-1.5 py-0.5 text-[9px] font-bold uppercase">Hoje</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isViewingToday && (
            <Button variant="ghost" size="sm" onClick={() => setViewWd(wd === 0 ? 1 : wd)}>
              Voltar para hoje
            </Button>
          )}
        </section>




        {/* Tarefas extras do dia */}
        <section className="card-elevated rounded-xl p-5 border-l-4 border-status-red">
          <button
            type="button"
            onClick={() => toggle("extras")}
            className="w-full flex items-center gap-2 mb-3 text-left hover:opacity-80"
            aria-expanded={isOpen("extras")}
          >
            {isOpen("extras") ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            <Sparkles className="h-4 w-4 text-status-yellow" />
            <h2 className="text-lg font-semibold">Tarefas extras de hoje</h2>
            <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <SectionStatus pending={pendingExtras.length} total={extras.length} />
              {pendingExtras.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-status-red/15 text-status-red px-2 py-0.5 font-semibold ring-1 ring-status-red/30">
                  {pendingExtras.length} pendente{pendingExtras.length === 1 ? "" : "s"}
                </span>
              )}
              <span>{extras.length}</span>
            </span>
          </button>
          {isOpen("extras") && (
            <div className="space-y-3">
              {canEdit && (
                <form
                  onSubmit={(e) => { e.preventDefault(); addExtra(); }}
                  className="flex gap-2"
                >
                  <Input
                    value={extraTitle}
                    onChange={(e) => setExtraTitle(e.target.value)}
                    placeholder="Adicionar tarefa extra… (inicia em andamento; dois cliques para concluir)"
                    maxLength={200}
                    disabled={addingExtra}
                  />
                  <Button type="submit" disabled={addingExtra || !extraTitle.trim()}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </form>
              )}
              {extras.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma tarefa extra hoje.</p>
              ) : (
                <div className="space-y-2">
                  {extras.map((e) => {
                    const s = (e.status as CompletionStatus) ?? "pending";
                    return (
                      <div key={e.id} className="flex items-stretch gap-2">
                        <div className="flex-1">
                          <TrafficTaskItem
                            title={e.title}
                            group="Extra"
                            status={s}
                            disabled={!canEdit}
                            onCycle={() => cycleExtra(e.id, s)}
                            onComplete={() => completeExtra(e.id)}
                          />
                        </div>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Excluir"
                            onClick={() => removeExtra(e.id)}
                            className="shrink-0 self-center text-muted-foreground hover:text-status-red"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Tarefa recém-criada entra como <span className="text-status-red font-semibold">pendente</span>. Dê <strong>dois cliques</strong> para marcar como concluída.
              </p>
            </div>
          )}
        </section>




        {viewWd === 0 && (
          <div className="card-elevated rounded-lg p-6 text-center">
            <p className="text-muted-foreground">Domingo — nenhuma tarefa programada.</p>
          </div>
        )}

        {Object.keys(highlightGrouped).length === 0 && viewWd !== 0 && !tasksQ.isLoading && (

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
          const sectionKey = `hl:${groupKey}`;
          const pendCount = list.filter((t) => (statusById.get(t.id) ?? "pending") !== "done").length;
          return (
            <section key={groupKey} className="card-elevated rounded-xl p-5 border-l-4 border-status-yellow">
              <button
                type="button"
                onClick={() => toggle(sectionKey)}
                className="w-full flex items-start gap-2 mb-4 text-left hover:opacity-80"
                aria-expanded={isOpen(sectionKey)}
              >
                {isOpen(sectionKey) ? <ChevronDown className="h-5 w-5 mt-1 shrink-0" /> : <ChevronRight className="h-5 w-5 mt-1 shrink-0" />}
                <div>
                  <h2 className="text-lg font-semibold leading-tight">{groupKey}</h2>
                  {groupKey === CATEGORY_LABELS.semanal && (
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1 flex items-center gap-2">
                      <span>{WEEKDAY_LABELS[viewWd]}</span>
                      {isViewingToday && <span className="inline-flex items-center rounded-full bg-status-green/15 text-status-green px-2 py-0.5 text-[10px] font-semibold ring-1 ring-status-green/30">Hoje</span>}
                    </p>
                  )}

                </div>
                <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  <SectionStatus pending={pendCount} total={list.length} />
                  <span>{list.length}</span>
                </span>
              </button>
              {isOpen(sectionKey) && (
                <div className="space-y-4">
                  {Object.entries(bySub).map(([sub, tasksSub]) => {
                    const subKey = `${sectionKey}:${sub}`;
                    const subPend = tasksSub.filter((t) => (statusById.get(t.id) ?? "pending") !== "done").length;
                    return (
                      <div key={sub}>
                        {sub !== "Geral" && (
                          <button
                            type="button"
                            onClick={() => toggle(subKey)}
                            className="flex items-center gap-2 mb-2 hover:opacity-80"
                            aria-expanded={isOpen(subKey)}
                          >
                            {isOpen(subKey) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">{sub}</h3>
                            <SectionStatus pending={subPend} total={tasksSub.length} />
                          </button>
                        )}
                        {isOpen(subKey) && (
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
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        {/* Quadro menor: outras periodicidades */}
        {Object.keys(otherGrouped).length > 0 && (
          <section className="card-elevated rounded-xl p-4 opacity-90">
            <button
              type="button"
              onClick={() => toggle("other")}
              className="flex items-center gap-2 mb-3 hover:opacity-80"
              aria-expanded={isOpen("other")}
            >
              {isOpen("other") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Outras tarefas periódicas</h2>
            </button>
            {isOpen("other") && (
            <div className="grid gap-4 md:grid-cols-3">
              {Object.entries(otherGrouped).map(([groupKey, list]) => {
                const k = `other:${groupKey}`;
                const catKey = (Object.entries(CATEGORY_LABELS).find(([, v]) => v === groupKey)?.[0]) ?? "";
                const showNote = catKey === "quinzenal" || catKey === "mensal";
                return (
                <div key={groupKey} className="rounded-lg border border-border p-3">
                  <button
                    type="button"
                    onClick={() => toggle(k)}
                    className="w-full flex items-center gap-1 mb-2 hover:opacity-80"
                    aria-expanded={isOpen(k)}
                  >
                    {isOpen(k) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <h3 className="text-xs font-semibold">{groupKey}</h3>
                    <span className="ml-auto text-[10px] text-muted-foreground">{list.length}</span>
                  </button>
                  {isOpen(k) && (
                    <>
                    <ul className="space-y-1 text-xs">
                      {list.map((t) => {
                        const s = statusById.get(t.id) ?? "pending";
                        const tone = s === "done" ? "text-status-green line-through" : s === "in_progress" ? "text-status-yellow" : "text-muted-foreground";
                        const lastDone = catKey === "mensal" ? monthlyLastDoneById.get(t.id) : undefined;
                        return (
                          <li key={t.id} className="flex items-start gap-2">
                            <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${s === "done" ? "bg-status-green" : s === "in_progress" ? "bg-status-yellow" : "bg-status-red"}`} />
                            <div className="flex-1 min-w-0">
                              <button
                                type="button"
                                disabled={!canEdit}
                                onClick={() => cycle(t.id)}
                                onDoubleClick={() => complete(t.id)}
                                className={`text-left ${tone} disabled:cursor-not-allowed`}
                              >
                                {t.title}
                              </button>
                              {lastDone && (
                                <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                                  ✓ Concluída em {new Date(lastDone + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {showNote && (
                      <GroupNote category={catKey} date={today} categoryLabel={groupKey} canEdit={canEdit} />
                    )}
                    </>
                  )}
                </div>
                );
              })}
            </div>
            )}
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
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={playMonthlyAlertSound} className="shrink-0" title="Ouvir alerta">
                  <Volume2 className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={ackMonthAlert} className="flex-1">Estou ciente</Button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Edit profile dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserCog className="h-5 w-5" /> Editar perfil</DialogTitle>
            <DialogDescription>Atualize o seu nome de exibição.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Nome de exibição</label>
              <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Seu nome" maxLength={80} />
            </div>
            {profileQ.data?.email && (
              <p className="text-xs text-muted-foreground">Email: {profileQ.data.email}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProfileOpen(false)}>Cancelar</Button>
            <Button onClick={saveProfile} disabled={savingProfile}>{savingProfile ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
