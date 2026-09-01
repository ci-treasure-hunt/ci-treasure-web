-- I-158: lock down RPCs that anon should never have been able to execute, and drop a duplicate index.
--
-- All four RPC findings were confirmed by ACTUALLY CALLING the function with the public anon key,
-- not by reading the advisor list. That mattered: PostgREST resolves a function signature BEFORE
-- checking EXECUTE permission, so probing with a bogus argument name returns PGRST202 whether or not
-- the caller is allowed. Only a real call distinguishes the two.
--
-- Why the existing `revoke all ... from public` lines in earlier migrations did not do the job:
-- Supabase's `ALTER DEFAULT PRIVILEGES` grants EXECUTE to `anon` and `authenticated` BY NAME. A
-- revoke from the PUBLIC pseudo-role does not remove a named grant, so these functions stayed
-- callable. Exactly the same trap as table-level grants vs column-level revokes in I-165 F3:
-- revoke from the named roles, then grant back only what is actually needed.

-- 1. search_similar_profiles ------------------------------------------------------------------
-- Confirmed leak: called with the anon key it returned shadow profiles (name, slug, bio snippet)
-- to an unauthenticated caller. Searching "Winti" returned the shadow profile "Winti Jam".
--
-- Shadow profiles being findable and claimable is a deliberate feature, so this keeps
-- `authenticated`. Every path that uses it already requires sign-in (/dashboard/new-profile and
-- /dashboard/claim both gate on auth; submit_profile_claim refuses without a session), so nothing
-- a real user does is affected.
--
-- This matters more than today's 7 shadow rows suggest: I-066 plans to import ~608 CIGC teacher
-- profiles as shadow. Anon-callable, that becomes a bulk-harvestable dataset of scraped people.
REVOKE EXECUTE ON FUNCTION public.search_similar_profiles(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.search_similar_profiles(text) TO authenticated, service_role;

-- 2. run_data_quality_checks ------------------------------------------------------------------
-- Confirmed leak, and the worst of the four: executing it with the anon key returned a 50KB
-- internal audit report. Most buckets happened to be empty when tested, but the function exists
-- precisely to surface stale_drafts, shadow_linked, duplicate_profiles, orphan_events and friends,
-- so "empty today" is luck, not design. An anonymous caller would see unpublished drafts the moment
-- any exist. Its only real caller is scripts/pipeline/db_quality_check.py, which uses the service
-- role key.
REVOKE EXECUTE ON FUNCTION public.run_data_quality_checks() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.run_data_quality_checks() TO service_role;

-- 3. refresh_entity_has_email -----------------------------------------------------------------
-- Added by I-165 F3 earlier today and left callable by anon (returned 204, i.e. it really ran).
-- Impact is close to nil: it only recomputes has_email from entity_emails and the
-- `is distinct from` guard makes it a no-op, so it cannot even be used to spam the revalidation
-- webhook. But it is an internal trigger helper and has no business in the public API.
-- entity_emails_sync_flag is SECURITY DEFINER and runs as the owner, so the trigger path is
-- unaffected by these grants.
REVOKE EXECUTE ON FUNCTION public.refresh_entity_has_email(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refresh_entity_has_email(text, uuid) TO service_role;

-- 4. submit_event_claim / submit_profile_claim ------------------------------------------------
-- Lower severity: anon can execute them, but they defend themselves and raise "Not authenticated"
-- (P0001) before doing anything. Revoked anyway so the exposed surface matches the intent that was
-- already written into their original migrations.
REVOKE EXECUTE ON FUNCTION public.submit_event_claim(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_event_claim(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.submit_profile_claim(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_profile_claim(uuid) TO authenticated, service_role;

-- Deliberately NOT touched -----------------------------------------------------------------------
--   has_role, is_event_organizer  -- called from RLS policies. Postgres checks EXECUTE at runtime
--                                    regardless of context, so revoking these would break access
--                                    for every signed-in user.
--   get_event_credited_people     -- intentionally public; backs credits on published event pages.
--   show_limit, show_trgm         -- pg_trgm's own functions, exposed because the extension lives
--                                    in `public`. Inert (they read/set a session similarity
--                                    threshold). Moving pg_trgm is a separate, riskier change:
--                                    three GIN indexes use gin_trgm_ops, and any function pinned to
--                                    search_path 'public' that uses similarity() would break.

-- 5. Duplicate index on events ------------------------------------------------------------------
-- initial_schema.sql declares `short_id text UNIQUE` at line 444, which already creates
-- events_short_id_key, and then adds an identical explicit index at line 578. Both have been
-- maintained on every insert since. Drop the explicit one; the constraint-backed index cannot be
-- dropped without dropping the constraint, and the constraint is the one worth keeping.
DROP INDEX IF EXISTS public.idx_events_short_id;
