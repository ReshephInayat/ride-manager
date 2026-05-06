
-- Revoke anon EXECUTE on token-based driver functions (these are called via authenticated RPC)
REVOKE EXECUTE ON FUNCTION public.driver_rides_by_token(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_update_status_by_token(text, uuid, ride_status) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_update_location_by_token(text, uuid, double precision, double precision, double precision, double precision, double precision) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_notifications_by_token(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_mark_read_by_token(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_delete_notifications_by_token(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_clear_location_by_token(text) FROM anon;

-- The login function MUST remain callable by anon (drivers are not authenticated users)
-- driver_login_with_token - KEEP anon access
-- get_invoice_by_token - KEEP anon access (public invoice page)
-- get_invoice_items_by_token - KEEP anon access (public invoice page)
-- log_invoice_access - KEEP anon access (public invoice page)

-- Revoke anon from internal helper functions
REVOKE EXECUTE ON FUNCTION public.build_ride_key(date, text, text, text, text, text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.normalize_ride_key_text(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.normalize_ride_key_time(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rides_set_dedupe_key() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_default_routes() FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_default_driver() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notifications_log_insert() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rides_log_changes() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rides_notify_driver_changes() FROM anon;
