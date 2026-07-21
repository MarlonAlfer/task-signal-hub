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

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const { data: roles = [], isLoading } = useRoles();
  const role = highestRole(roles);

  if (isLoading) return <div className="p-8 text-muted-foreground">Carregando…</div>;
  if (role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Acesso restrito</h2>
          <p className="text-muted-foreground mt-2">Apenas administradores podem acessar esta área.</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/dashboard" })}>Voltar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border sticky top-0 backdrop-blur bg-background/70 z-10">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Link>
          </Button>
          <h1 className="text-lg font-bold">Administração</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Tabs defaultValue="tasks">
          <TabsList>
            <TabsTrigger value="tasks">Tarefas</TabsTrigger>
            <TabsTrigger value="users">Usuários & Papéis</TabsTrigger>
            <TabsTrigger value="audit">Auditoria</TabsTrigger>
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

  async function save(t: Partial<TaskRow>) {
    if (!t.title || !t.category) return toast.error("Preencha título e categoria.");
    if (t.id) {
      const { error } = await supabase.from("tasks").update({
        title: t.title, category: t.category, weekday: t.weekday ?? null, group_label: t.group_label ?? null, position: t.position ?? 0, active: t.active ?? true,
      }).eq("id", t.id);
      if (error) return toast.error(error.message);
      await logAudit("task_update", "tasks", t.id, { title: t.title });
    } else {
      const { error, data } = await supabase.from("tasks").insert({
        title: t.title, category: t.category, weekday: t.weekday ?? null, group_label: t.group_label ?? null, position: t.position ?? 0,
      }).select().single();
      if (error) return toast.error(error.message);
      await logAudit("task_create", "tasks", data?.id ?? null, { title: t.title });
    }
    toast.success("Tarefa salva.");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin-tasks"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta tarefa?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await logAudit("task_delete", "tasks", id);
    toast.success("Excluída.");
    qc.invalidateQueries({ queryKey: ["admin-tasks"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  const tasks = tasksQ.data ?? [];

  return (
    <div className="mt-6 space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{tasks.length} tarefa(s) cadastrada(s)</p>
        <Button onClick={() => setEditing({ category: "diaria", position: 0 })}>
          <Plus className="h-4 w-4 mr-2" />Nova tarefa
        </Button>
      </div>

      <div className="card-elevated rounded-lg divide-y divide-border">
        {tasks.map((t) => (
          <div key={t.id} className="p-3 flex items-start gap-3">
            <div className="flex-1">
              <div className="font-medium">{t.title}</div>
              <div className="text-xs text-muted-foreground">
                {CATEGORY_LABELS[t.category]}
                {t.weekday ? ` · ${WEEKDAY_LABELS[t.weekday]}` : ""}
                {t.group_label ? ` · ${t.group_label}` : ""}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-status-red" /></Button>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Título</Label>
                <Input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div>
                <Label>Categoria</Label>
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
                  <Label>Dia da semana</Label>
                  <Select value={String(editing.weekday ?? "1")} onValueChange={(v) => setEditing({ ...editing, weekday: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1,2,3,4,5,6].map((d) => <SelectItem key={d} value={String(d)}>{WEEKDAY_LABELS[d]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Agrupamento (opcional)</Label>
                <Input value={editing.group_label ?? ""} onChange={(e) => setEditing({ ...editing, group_label: e.target.value })} placeholder="Ex.: Piscinas, Jardim..." />
              </div>
              <div>
                <Label>Ordem</Label>
                <Input type="number" value={editing.position ?? 0} onChange={(e) => setEditing({ ...editing, position: Number(e.target.value) })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => editing && save(editing)}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UsersAdmin() {
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
    toast.success("Papel atualizado.");
    qc.invalidateQueries({ queryKey: ["all-profiles-roles"] });
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteUserFn({ data: { userId: deleting.id } });
      toast.success("Conta excluída.");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["all-profiles-roles"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir conta.");
    } finally {
      setBusy(false);
    }
  }

  const rows = q.data ?? [];
  const meId = meQ.data;

  return (
    <div className="mt-6 space-y-2">
      <p className="text-sm text-muted-foreground">Defina o papel de cada usuário cadastrado. Como administrador, você pode excluir contas de outros usuários e visitantes.</p>
      <div className="card-elevated rounded-lg divide-y divide-border">
        {rows.map((u) => {
          const current: AppRole = u.roles.includes("admin") ? "admin" : u.roles.includes("user") ? "user" : "visitor";
          const isSelf = u.id === meId;
          return (
            <div key={u.id} className="p-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="font-medium">{u.display_name || u.email}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </div>
              <Select value={current} onValueChange={(v) => setRole(u.id, v as AppRole)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="visitor">Visitante</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                title={isSelf ? "Você não pode excluir sua própria conta" : "Excluir conta"}
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
            <DialogTitle>Excluir conta</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir permanentemente a conta de <span className="font-medium text-foreground">{deleting?.label}</span>? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuditView() {
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
      <p className="text-sm text-muted-foreground mb-2">Últimas 200 alterações (data, hora, usuário, ação).</p>
      <div className="card-elevated rounded-lg divide-y divide-border">
        {rows.length === 0 && <div className="p-4 text-muted-foreground text-sm">Nenhuma alteração registrada.</div>}
        {rows.map((r) => (
          <div key={r.id as string} className="p-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{r.action}</span>
              <span className="text-xs text-muted-foreground">{new Date(r.created_at as string).toLocaleString("pt-BR")}</span>
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
