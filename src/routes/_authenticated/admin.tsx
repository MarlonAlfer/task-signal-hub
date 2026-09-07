import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useRoles, highestRole, type AppRole } from "@/hooks/useRoles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Pencil } from "lucide-react";
import { WEEKDAY_LABELS, CATEGORY_LABELS } from "@/lib/task-utils";
import { logAudit } from "@/lib/audit";
import { deleteUserAccount } from "@/lib/admin-users.functions";
import type { TaskRow } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { currentLocale } from "@/i18n";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: roles = [], isLoading } = useRoles();
  const role = highestRole(roles);

  if (isLoading) return <div className="p-8 text-muted-foreground">{t("common.loading")}</div>;
  if (role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold">{t("admin.accessRestricted")}</h2>
          <p className="text-muted-foreground mt-2">{t("admin.accessRestrictedDesc")}</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/dashboard" })}>{t("common.back")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border sticky top-0 backdrop-blur bg-background/70 z-10">
        <div className="mx-auto max-w-6xl px-3 sm:px-4 py-3 sm:py-4 flex items-center gap-2 sm:gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-2" />{t("common.back")}</Link>
          </Button>
          <h1 className="truncate text-base sm:text-lg font-bold">{t("admin.title")}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-3 sm:px-4 py-5 sm:py-6">
        <Tabs defaultValue="tasks">
          <TabsList className="w-full grid grid-cols-3 sm:inline-flex sm:w-auto">
            <TabsTrigger value="tasks">{t("admin.tabTasks")}</TabsTrigger>
            <TabsTrigger value="users">{t("admin.tabUsers")}</TabsTrigger>
            <TabsTrigger value="audit">{t("admin.tabAudit")}</TabsTrigger>
          </TabsList>
          <TabsContent value="tasks"><TasksAdmin /></TabsContent>
          <TabsContent value="users"><UsersAdmin /></TabsContent>
          <TabsContent value="audit"><AuditView /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function TasksAdmin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<TaskRow> | null>(null);
  const tasksQ = useQuery({
    queryKey: ["admin-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").order("category").order("weekday").order("position");
      if (error) throw error;
      return (data ?? []) as TaskRow[];
    },
  });

  async function save(tk: Partial<TaskRow>) {
    if (!tk.title || !tk.category) return toast.error(t("admin.fillTitleCategory"));
    if (tk.id) {
      const { error } = await supabase.from("tasks").update({
        title: tk.title, category: tk.category, weekday: tk.weekday ?? null, group_label: tk.group_label ?? null, position: tk.position ?? 0, active: tk.active ?? true,
      }).eq("id", tk.id);
      if (error) return toast.error(error.message);
      await logAudit("task_update", "tasks", tk.id, { title: tk.title });
    } else {
      const { error, data } = await supabase.from("tasks").insert({
        title: tk.title, category: tk.category, weekday: tk.weekday ?? null, group_label: tk.group_label ?? null, position: tk.position ?? 0,
      }).select().single();
      if (error) return toast.error(error.message);
      await logAudit("task_create", "tasks", data?.id ?? null, { title: tk.title });
    }
    toast.success(t("admin.taskSaved"));
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin-tasks"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  async function remove(id: string) {
    if (!confirm(t("admin.confirmDelete"))) return;
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await logAudit("task_delete", "tasks", id);
    toast.success(t("admin.deleted"));
    qc.invalidateQueries({ queryKey: ["admin-tasks"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  const tasks = tasksQ.data ?? [];

  return (
    <div className="mt-6 space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{t("admin.countLabel", { count: tasks.length })}</p>
        <Button onClick={() => setEditing({ category: "diaria", position: 0 })}>
          <Plus className="h-4 w-4 mr-2" />{t("admin.newTask")}
        </Button>
      </div>

      <div className="card-elevated rounded-lg divide-y divide-border">
        {tasks.map((task) => (
          <div key={task.id} className="p-3 flex items-start gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium break-words">{task.title}</div>
              <div className="text-xs text-muted-foreground">
                {CATEGORY_LABELS[task.category]}
                {task.weekday ? ` · ${WEEKDAY_LABELS[task.weekday]}` : ""}
                {task.group_label ? ` · ${task.group_label}` : ""}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setEditing(task)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => remove(task.id)}><Trash2 className="h-4 w-4 text-status-red" /></Button>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? t("admin.editTask") : t("admin.newTaskTitle")}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>{t("admin.fieldTitle")}</Label>
                <Input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div>
                <Label>{t("admin.fieldCategory")}</Label>
                <Select value={editing.category} onValueChange={(v) => setEditing({ ...editing, category: v as TaskRow["category"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editing.category === "semanal" && (
                <div>
                  <Label>{t("admin.fieldWeekday")}</Label>
                  <Select value={String(editing.weekday ?? "1")} onValueChange={(v) => setEditing({ ...editing, weekday: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1,2,3,4,5,6].map((d) => <SelectItem key={d} value={String(d)}>{WEEKDAY_LABELS[d]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>{t("admin.fieldGroup")}</Label>
                <Input value={editing.group_label ?? ""} onChange={(e) => setEditing({ ...editing, group_label: e.target.value })} placeholder={t("admin.fieldGroupPh")} />
              </div>
              <div>
                <Label>{t("admin.fieldOrder")}</Label>
                <Input type="number" value={editing.position ?? 0} onChange={(e) => setEditing({ ...editing, position: Number(e.target.value) })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
            <Button onClick={() => editing && save(editing)}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UsersAdmin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const deleteUserFn = useServerFn(deleteUserAccount);
  const [deleting, setDeleting] = useState<{ id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const meQ = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const q = useQuery({
    queryKey: ["all-profiles-roles"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase.from("profiles").select("id, email, display_name, created_at").order("created_at", { ascending: false });
      if (error) throw error;
      const { data: rolesData } = await supabase.from("user_roles").select("user_id, role");
      const byUser: Record<string, AppRole[]> = {};
      for (const r of rolesData ?? []) (byUser[r.user_id as string] ??= []).push(r.role as AppRole);
      return (profiles ?? []).map((p) => ({ ...p, roles: byUser[p.id] ?? [] }));
    },
  });

  async function setRole(user_id: string, role: AppRole) {
    const { error: del } = await supabase.from("user_roles").delete().eq("user_id", user_id);
    if (del) return toast.error(del.message);
    const { error } = await supabase.from("user_roles").insert({ user_id, role });
    if (error) return toast.error(error.message);
    await logAudit("role_change", "user_roles", user_id, { role });
    toast.success(t("admin.roleUpdated"));
    qc.invalidateQueries({ queryKey: ["all-profiles-roles"] });
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteUserFn({ data: { userId: deleting.id } });
      toast.success(t("admin.accountDeleted"));
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["all-profiles-roles"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("admin.deleteErr"));
    } finally {
      setBusy(false);
    }
  }

  const rows = q.data ?? [];
  const meId = meQ.data;

  return (
    <div className="mt-6 space-y-2">
      <p className="text-sm text-muted-foreground">{t("admin.usersDesc")}</p>
      <div className="card-elevated rounded-lg divide-y divide-border">
        {rows.map((u) => {
          const current: AppRole = u.roles.includes("admin") ? "admin" : u.roles.includes("user") ? "user" : u.roles.includes("visitor") ? "visitor" : "pending";
          const isSelf = u.id === meId;
          return (
            <div key={u.id} className="p-3 flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                <div className="font-medium break-words">{u.display_name || u.email}</div>
                <div className="truncate text-xs text-muted-foreground">{u.email}</div>
              </div>
              <Select value={current} onValueChange={(v) => setRole(u.id, v as AppRole)}>
                <SelectTrigger className="w-36 sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                  <SelectItem value="user">{t("roles.user")}</SelectItem>
                  <SelectItem value="visitor">{t("roles.visitor")}</SelectItem>
                  <SelectItem value="pending">{t("roles.pending")}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                title={isSelf ? t("admin.cantDeleteSelf") : t("admin.deleteAccount")}
                disabled={isSelf}
                onClick={() => setDeleting({ id: u.id, label: u.display_name || u.email || u.id })}
              >
                <Trash2 className="h-4 w-4 text-status-red" />
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && !busy && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.deleteAccount")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("admin.deleteAccountConfirm", { label: deleting?.label ?? "" })}
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? t("admin.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuditView() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = q.data ?? [];

  return (
    <div className="mt-6">
      <p className="text-sm text-muted-foreground mb-2">{t("admin.auditDesc")}</p>
      <div className="card-elevated rounded-lg divide-y divide-border">
        {rows.length === 0 && <div className="p-4 text-muted-foreground text-sm">{t("admin.auditNone")}</div>}
        {rows.map((r) => (
          <div key={r.id as string} className="p-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{r.action}</span>
              <span className="text-xs text-muted-foreground">{new Date(r.created_at as string).toLocaleString(currentLocale())}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {r.user_email ?? r.user_id} · {r.entity}{r.entity_id ? ` #${String(r.entity_id).slice(0,8)}` : ""}
            </div>
            {r.details ? <pre className="text-xs mt-1 text-muted-foreground overflow-auto">{JSON.stringify(r.details, null, 0)}</pre> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
