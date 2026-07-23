import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StickyNote, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

type Props = {
  category: string;
  date: string;
  categoryLabel: string;
  canEdit: boolean;
};

export function GroupNote({ category, date, categoryLabel, canEdit }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const queryKey = useMemo(() => ["group-note", category, date], [category, date]);

  const q = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_notes" as never)
        .select("note")
        .eq("category", category)
        .eq("note_date", date)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return ((data as { note?: string } | null)?.note) ?? "";
    },
  });

  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current && q.data !== undefined) {
      setValue(q.data);
      initialized.current = true;
    }
  }, [q.data]);

  useEffect(() => {
    initialized.current = false;
  }, [category, date]);

  const dirty = value !== (q.data ?? "");

  async function save() {
    if (!canEdit) return toast.error(t("note.visitorCant"));
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const payload = {
      category,
      note_date: date,
      note: value,
      updated_by: u.user?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("group_notes" as never)
      .upsert(payload as never, { onConflict: "category,note_date" });
    setSaving(false);
    if (error) return toast.error(error.message);
    setSavedAt(Date.now());
    qc.invalidateQueries({ queryKey });
  }

  return (
    <div className="mt-4 pt-4 border-t border-border/50">
      <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
        <StickyNote className="h-3.5 w-3.5" />
        {t("note.label", { category: categoryLabel.toLowerCase() })}
      </label>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={!canEdit}
        placeholder={canEdit ? t("note.placeholder") : t("note.readOnly")}
        rows={2}
        className="w-full resize-y rounded-md border border-border/60 bg-background/40 backdrop-blur px-3 py-2 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
      />
      {canEdit && (
        <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          {savedAt && !dirty && (
            <span className="inline-flex items-center gap-1 text-status-green">
              <Check className="h-3 w-3" /> {t("common.saved")}
            </span>
          )}
          <Button size="sm" variant="secondary" onClick={save} disabled={saving || !dirty}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? t("common.saving") : t("note.saveBtn")}
          </Button>
        </div>
      )}
    </div>
  );
}
