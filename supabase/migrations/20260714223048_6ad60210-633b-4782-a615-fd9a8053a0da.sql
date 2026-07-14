
-- Fix: profiles readable by everyone authenticated
DROP POLICY IF EXISTS "read all profiles authenticated" ON public.profiles;

CREATE POLICY "read own profile" ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- Fix: has_role callable directly by signed-in users
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
