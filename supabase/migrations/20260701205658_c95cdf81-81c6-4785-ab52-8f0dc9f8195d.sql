-- Fix: authenticated role needs EXECUTE on has_role (called by RLS/policies and server fns)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;