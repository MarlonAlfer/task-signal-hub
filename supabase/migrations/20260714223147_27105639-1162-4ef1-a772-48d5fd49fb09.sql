
CREATE OR REPLACE FUNCTION public.enforce_audit_log_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_email text;
BEGIN
  NEW.user_id := auth.uid();
  SELECT email INTO jwt_email FROM auth.users WHERE id = auth.uid();
  NEW.user_email := jwt_email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_audit_log_identity_trg ON public.audit_log;
CREATE TRIGGER enforce_audit_log_identity_trg
BEFORE INSERT ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_log_identity();
