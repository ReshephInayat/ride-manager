
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.seed_default_routes() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_routes() FROM PUBLIC, anon, authenticated;
