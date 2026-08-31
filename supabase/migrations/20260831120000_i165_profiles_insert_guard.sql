-- I-165 Finding 1 — close the INSERT-side privilege-escalation gap on `profiles`.
--
-- I-128 (20260717223555) fixed this escalation class on UPDATE via the
-- `protect_profile_privileged_columns` trigger, but that trigger is BEFORE UPDATE only and
-- `profiles_insert_authenticated`'s WITH CHECK was left as a bare ownership test. So the exact
-- attack I-128 called Critical is still reachable by setting the column at INSERT time instead of
-- updating it afterwards:
--
--   POST /rest/v1/profiles  { user_id: <own uid>, is_trusted: true, visibility: 'public',
--                             show_in_list: true, image_status: 'approved' }
--
-- `is_trusted` is the one that matters: it auto-publishes that user's future events with no
-- moderation (app/events/actions.ts trusted-organizer branch), which also fires the automatic
-- public Telegram announcement.
--
-- Column defaults are already safe (false/'shadow'/false/'pending') but a default only applies
-- when the column is omitted, so it stops nothing here.
--
-- This mirrors the shape already shipped for `events` in I-128, which got the WITH CHECK treatment
-- on INSERT *as well as* the trigger on UPDATE.
--
-- Not affected by this policy: service_role and the postgres superuser both bypass RLS entirely,
-- so the app's own profile creation (app/dashboard/new-profile/actions.ts, admin client),
-- enrichment scripts, and Supabase MCP / SQL editor writes are all unchanged.

-- Role scoping deliberately left as PUBLIC, matching the policy this replaces and the rest of the
-- schema (36 of 40 policies are TO PUBLIC; 4 are TO authenticated,anon; none is TO authenticated
-- alone). `TO authenticated` was considered and rejected: it would be no more secure here, since
-- anon cannot satisfy `auth.uid() = user_id` anyway (auth.uid() is NULL, and NULL = user_id is NULL,
-- not true), and it would make this the only role-scoped policy in the database. If role scoping is
-- worth adopting it should be done uniformly in its own migration, not smuggled into a security fix
-- whose diff needs to stay trivially auditable.
DROP POLICY IF EXISTS profiles_insert_authenticated ON public.profiles;

CREATE POLICY profiles_insert_authenticated ON public.profiles
  FOR INSERT
  WITH CHECK (
    (select auth.uid()) = user_id
    AND is_trusted = false
    AND show_in_list = false
    AND visibility = 'shadow'::profile_visibility
    AND image_status = 'pending'
  );
