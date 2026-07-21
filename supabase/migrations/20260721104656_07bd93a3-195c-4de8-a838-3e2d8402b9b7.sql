
CREATE TABLE public.extra_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  task_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.extra_tasks TO authenticated;
GRANT ALL ON public.extra_tasks TO service_role;

ALTER TABLE public.extra_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can view extra tasks"
  ON public.extra_tasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin/user can insert extra tasks"
  ON public.extra_tasks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));

CREATE POLICY "admin/user can update extra tasks"
  ON public.extra_tasks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));

CREATE POLICY "admin/user can delete extra tasks"
  ON public.extra_tasks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));

CREATE OR REPLACE FUNCTION public.touch_extra_tasks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_extra_tasks_updated_at
  BEFORE UPDATE ON public.extra_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_extra_tasks_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.extra_tasks;
ALTER TABLE public.extra_tasks REPLICA IDENTITY FULL;

CREATE INDEX extra_tasks_date_idx ON public.extra_tasks(task_date);
