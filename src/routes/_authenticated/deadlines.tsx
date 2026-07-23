import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, CalendarClock, Plus, Trash2, CheckCircle2, RotateCcw, AlertTriangle } from "lucide-react";
import { useRoles, highestRole } from "@/hooks/useRoles";
import { logAudit } from "@/lib/audit";
import { useTranslation } from "react-i18next";
import { currentLocale } from "@/i18n";

export const Route = createFileRoute("/_authenticated/deadlines")({
  component: DeadlinesPage,
});

type Deadline = {
  id: string;
  title: string;
  started_on: string;
  due_on: string;
  notes: string | null;
  completed: boolean;
  acknowledged_dates: string[] | null;
  created_at: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function fmt(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(currentLocale());
}
function daysBetween(a: string, b: string) {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / 86400000);
}

function DeadlinesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: roles = [] } = useRoles();
  const role = highestRole(roles);
  const canEdit = role === "admin" || role === "user";

  const today = todayISO();
  const [title, setTitle] = useState("");
  const [startedOn, setStartedOn] = useState(today);
  const [dueOn, setDueOn] = useState(addDaysISO(today, 21));
  const [notes, setNotes] = useState("");

  const q = useQuery({
    queryKey: ["deadlines", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deadlines" as never)
        .select("*")
        .order("completed", { ascending: true })
        .order("due_on", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Deadline[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error(t("deadlines.errNoTitle"));
      if (!startedOn || !dueOn) throw new Error(t("deadlines.errNoDates"));
      if (dueOn < startedOn) throw new Error(t("deadlines.errDueBeforeStart"));
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        title: title.trim(),
        started_on: startedOn,
        due_on: dueOn,
        notes: notes.trim() || null,
        created_by: u.user?.id ?? null,
      };
      const { error, data } = await supabase.from("deadlines" as never).insert(payload as never).select().single();
      if (error) throw error;
      await logAudit("create", "deadline", (data as { id?: string })?.id ?? null, { title: payload.title, due_on: payload.due_on });
    },
    onSuccess: () => {
      toast.success(t("deadlines.added"));
      setTitle("");
      setNotes("");
      setStartedOn(today);
      setDueOn(addDaysISO(today, 21));
      qc.invalidateQueries({ queryKey: ["deadlines"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDone = useMutation({
    mutationFn: async (d: Deadline) => {
      const { error } = await supabase
        .from("deadlines" as never)
        .update({ completed: !d.completed } as never)
        .eq("id", d.id);
      if (error) throw error;
      await logAudit(d.completed ? "reopen" : "complete", "deadline", d.id, { title: d.title });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deadlines"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (d: Deadline) => {
      const { error } = await supabase.from("deadlines" as never).delete().eq("id", d.id);
      if (error) throw error;
      await logAudit("delete", "deadline", d.id, { title: d.title });
    },
    onSuccess: () => {
      toast.success(t("deadlines.removed"));
      qc.invalidateQueries({ queryKey: ["deadlines"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = q.data ?? [];
  const open = useMemo(() => list.filter((d) => !d.completed), [list]);
  const done = useMemo(() => list.filter((d) => d.completed), [list]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border sticky top-0 backdrop-blur bg-background/70 z-10">
        <div className="mx-auto max-w-4xl px-4 py-4 flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-2" />{t("common.back")}</Link>
          </Button>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-status-yellow" />
            <h1 className="text-lg font-bold">{t("deadlines.title")}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        {canEdit && (
          <section className="rounded-xl border border-border/60 bg-background/60 backdrop-blur p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Plus className="h-4 w-4" /> {t("deadlines.add")}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{t("deadlines.serviceName")}</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("deadlines.servicePlaceholder")}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("deadlines.startDate")}</label>
                <Input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("deadlines.dueDate")}</label>
                <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{t("deadlines.notes")}</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("deadlines.notesPlaceholder")} />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                <Plus className="h-4 w-4 mr-2" />
                {create.isPending ? t("common.saving") : t("deadlines.add")}
              </Button>
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-2">
            {t("deadlines.inProgressCount", { count: open.length })}
          </h2>
          <div className="space-y-2">
            {open.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("deadlines.noneOpen")}</p>
            )}
            {open.map((d) => {
              const remaining = daysBetween(today, d.due_on);
              const overdue = remaining < 0;
              const soon = remaining >= 0 && remaining <= 1;
              return (
                <div key={d.id} className="rounded-lg border border-border/60 bg-background/60 backdrop-blur p-3 flex items-start gap-3">
                  <div className="mt-0.5">
                    {overdue ? <AlertTriangle className="h-5 w-5 text-status-red" />
                      : soon ? <AlertTriangle className="h-5 w-5 text-status-yellow" />
                      : <CalendarClock className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{d.title}</p>
                      {overdue && <Badge variant="destructive" className="text-[10px]">{t("deadlines.overdue", { n: -remaining })}</Badge>}
                      {!overdue && soon && <Badge className="text-[10px] bg-status-yellow text-black">{remaining === 0 ? t("common.today") : t("common.tomorrow")}</Badge>}
                      {!overdue && !soon && <Badge variant="outline" className="text-[10px]">{t("deadlines.daysLeft", { n: remaining })}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("deadlines.started")}: {fmt(d.started_on)} • {t("deadlines.dueOn")}: {fmt(d.due_on)}
                    </p>
                    {d.notes && <p className="text-xs text-muted-foreground mt-1 italic">{d.notes}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="secondary" onClick={() => toggleDone.mutate(d)} title={t("deadlines.markDone")}>
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => {
                        if (confirm(t("deadlines.confirmRemove", { title: d.title }))) remove.mutate(d);
                      }} title={t("common.remove")}>
                        <Trash2 className="h-4 w-4 text-status-red" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {done.length > 0 && (
          <section>
            <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-2">
              {t("deadlines.completedCount", { count: done.length })}
            </h2>
            <div className="space-y-2">
              {done.map((d) => (
                <div key={d.id} className="rounded-lg border border-border/40 bg-background/40 backdrop-blur p-3 flex items-start gap-3 opacity-70">
                  <CheckCircle2 className="h-5 w-5 text-status-green mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium line-through">{d.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("deadlines.started")}: {fmt(d.started_on)} • {t("deadlines.dueOn")}: {fmt(d.due_on)}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => toggleDone.mutate(d)} title={t("deadlines.reopenTitle")}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => {
                        if (confirm(t("deadlines.confirmRemove", { title: d.title }))) remove.mutate(d);
                      }} title={t("common.remove")}>
                        <Trash2 className="h-4 w-4 text-status-red" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
