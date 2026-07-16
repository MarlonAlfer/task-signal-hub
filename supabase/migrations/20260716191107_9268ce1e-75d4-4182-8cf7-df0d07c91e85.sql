
CREATE TABLE public.group_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  note_date date NOT NULL,
  note text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, note_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_notes TO authenticated;
GRANT ALL ON public.group_notes TO service_role;

ALTER TABLE public.group_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read group notes"
  ON public.group_notes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin or user can insert group notes"
  ON public.group_notes FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'));

CREATE POLICY "Admin or user can update group notes"
  ON public.group_notes FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'user'));

CREATE POLICY "Admin can delete group notes"
  ON public.group_notes FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER group_notes_set_updated_at
  BEFORE UPDATE ON public.group_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.group_notes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_notes;
