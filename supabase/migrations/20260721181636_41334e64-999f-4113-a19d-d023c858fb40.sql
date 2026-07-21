-- Ensure the admin role exists for the protected user
INSERT INTO public.user_roles (user_id, role)
VALUES ('ceba7b41-4825-4cbd-97d5-92f553ddda8a', 'admin')
ON CONFLICT DO NOTHING;

-- Trigger function: block deletion/change of admin role for the protected user
CREATE OR REPLACE FUNCTION public.protect_permanent_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  protected_id uuid := 'ceba7b41-4825-4cbd-97d5-92f553ddda8a';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.user_id = protected_id AND OLD.role = 'admin' THEN
      RAISE EXCEPTION 'Este administrador é permanente e não pode ser removido.';
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.user_id = protected_id AND OLD.role = 'admin' AND NEW.role <> 'admin' THEN
      RAISE EXCEPTION 'Este administrador é permanente e não pode ser alterado.';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_permanent_admin_trg ON public.user_roles;
CREATE TRIGGER protect_permanent_admin_trg
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_permanent_admin();

-- Also prevent deletion of the auth user via a guard on profiles cascade path
CREATE OR REPLACE FUNCTION public.protect_permanent_admin_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.id = 'ceba7b41-4825-4cbd-97d5-92f553ddda8a'::uuid THEN
    RAISE EXCEPTION 'Esta conta de administrador é permanente e não pode ser excluída.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS protect_permanent_admin_profile_trg ON public.profiles;
CREATE TRIGGER protect_permanent_admin_profile_trg
BEFORE DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_permanent_admin_profile();