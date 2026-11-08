-- I-165 November delta review: finish the deny-all pattern on the tables that missed it.
--
-- Supabase's ALTER DEFAULT PRIVILEGES grants every new public table and sequence to anon and
-- authenticated BY NAME. The deny-all tables (RLS on, no policies, service role only) are meant
-- to follow it with `revoke all ... from anon, authenticated`, as profile_invites and
-- event_submissions do. These were created without it:
--   - mcp_calls, tg_announcements: still held ALL privileges, TRUNCATE included, which RLS does
--     not govern. Not reachable (PostgREST has no TRUNCATE verb), but no role besides the service
--     role should hold it.
--   - the identity sequences of mcp_calls, newsletter_signup_log and support_clicks: anon could
--     USAGE them. Their tables were already revoked.
-- Every writer of these tables uses the service role (edge functions, lib/mcp/tools.ts, server
-- actions via createAdminClient, ci-treasure-hunt scripts), which is unaffected.

revoke all on public.mcp_calls from anon, authenticated;
revoke all on public.tg_announcements from anon, authenticated;

revoke all on sequence public.mcp_calls_id_seq from anon, authenticated;
revoke all on sequence public.newsletter_signup_log_id_seq from anon, authenticated;
revoke all on sequence public.support_clicks_id_seq from anon, authenticated;
