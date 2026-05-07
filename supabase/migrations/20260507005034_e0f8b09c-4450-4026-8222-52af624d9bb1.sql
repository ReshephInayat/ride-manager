
-- Revoke EXECUTE from anon on all internal SECURITY DEFINER functions
-- Keep anon access ONLY on: driver_login, driver_login_with_token, get_invoice_by_token, get_invoice_items_by_token

REVOKE EXECUTE ON FUNCTION public.set_driver_pin(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_activity(uuid, workspace_system, text, text, text, text, text, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rides_log_changes() FROM anon;
REVOKE EXECUTE ON FUNCTION public.build_ride_key(date, text, text, text, text, text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.normalize_ride_key_text(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.normalize_ride_key_time(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rides_set_dedupe_key() FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_default_routes() FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_default_driver() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notifications_log_insert() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_invoice_access(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rides_notify_driver_changes() FROM anon;

-- Also revoke from anon on token-based driver functions (these need a valid session token, not anon)
REVOKE EXECUTE ON FUNCTION public.driver_validate_session(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_update_location(uuid, text, uuid, double precision, double precision, double precision, double precision, double precision) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_clear_location(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_rides(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_update_ride_status(uuid, text, uuid, ride_status) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_mark_notifications_read(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_delete_notifications(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_notifications(uuid, text) FROM anon;

-- Token-based variants also revoke from anon (they validate session internally)
REVOKE EXECUTE ON FUNCTION public.driver_rides_by_token(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_update_status_by_token(text, uuid, ride_status) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_update_location_by_token(text, uuid, double precision, double precision, double precision, double precision, double precision) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_clear_location_by_token(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_notifications_by_token(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_mark_read_by_token(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.driver_delete_notifications_by_token(text) FROM anon;

-- Add deny-all RLS policies on driver_login_attempts (only SECURITY DEFINER functions use this table)
CREATE POLICY "deny_all_select" ON public.driver_login_attempts FOR SELECT USING (false);
CREATE POLICY "deny_all_insert" ON public.driver_login_attempts FOR INSERT WITH CHECK (false);
CREATE POLICY "deny_all_update" ON public.driver_login_attempts FOR UPDATE USING (false);
CREATE POLICY "deny_all_delete" ON public.driver_login_attempts FOR DELETE USING (false);
