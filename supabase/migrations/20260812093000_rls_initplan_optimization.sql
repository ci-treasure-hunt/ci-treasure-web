-- I-150 (perf side-quest): fix the "Auth RLS Initialization Plan" warning on 29 policies.
--
-- WHAT THE PROBLEM ACTUALLY IS
-- `auth.uid()` is declared STABLE, which permits — but does not require — the planner to hoist
-- it. Referenced bare inside an RLS predicate (`auth.uid() = user_id`), the planner keeps it in
-- the per-row filter, so the function is invoked once per row scanned. Wrapping it in a scalar
-- uncorrelated subquery — `(select auth.uid()) = user_id` — makes the planner evaluate it once
-- as an InitPlan and reuse the cached result for every row. This is about planner treatment,
-- NOT about the JWT changing between rows (it can't — it's fixed for the statement). The
-- authorization semantics are therefore identical; only the execution plan changes.
--
-- WHY has_role() IS WRAPPED WHOLE, NOT JUST ITS ARGUMENT
-- has_role(_user_id, _role) is STABLE SECURITY DEFINER and runs
-- `SELECT EXISTS (SELECT 1 FROM user_roles WHERE ...)` internally. It does NOT call auth.uid()
-- itself (it takes the uid as a parameter), so there's no nested problem to chase — but wrapping
-- only the argument (`has_role((select auth.uid()), 'admin')`) would hoist the cheap part and
-- leave the expensive part (a per-row subquery against user_roles) still running per row.
-- Wrapping the whole call — `(select has_role(auth.uid(), 'admin'))` — hoists the entire lookup
-- into a single InitPlan. The inner auth.uid() is then evaluated once inside that InitPlan.
--
-- WHAT IS DELIBERATELY *NOT* HOISTED
-- Correlated expressions cannot be InitPlans, because they depend on the row being tested:
--   * `EXISTS (SELECT 1 FROM events e WHERE e.id = <this row>.event_id AND ...)`
--   * `is_event_organizer(event_id)` — takes the row's own event_id as its argument
-- These stay per-row by necessity. What IS optimized is the `auth.uid()` calls *inside* them,
-- which otherwise re-evaluate per row of the inner scan. is_event_organizer's own body is fixed
-- separately at the bottom of this file for the same reason.
--
-- ALTER POLICY (rather than DROP + CREATE) is used throughout: it cannot accidentally change a
-- policy's command or roles, and there is no window where the policy does not exist.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
ALTER POLICY profiles_select_public ON public.profiles
  USING ((visibility = 'public'::profile_visibility) OR ((select auth.uid()) = user_id));

ALTER POLICY profiles_insert_authenticated ON public.profiles
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY profiles_update_owner_or_admin ON public.profiles
  USING (
    ((select auth.uid()) = user_id)
    OR (select has_role(auth.uid(), 'admin'::app_role))
  );

ALTER POLICY profiles_delete_admin ON public.profiles
  USING ((select has_role(auth.uid(), 'admin'::app_role)));

-- ---------------------------------------------------------------------------
-- venues
-- ---------------------------------------------------------------------------
ALTER POLICY venues_insert_authenticated ON public.venues
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY venues_update_owner_or_admin ON public.venues
  USING (
    ((select auth.uid()) = user_id)
    OR (select has_role(auth.uid(), 'admin'::app_role))
    OR (select has_role(auth.uid(), 'moderator'::app_role))
  );

ALTER POLICY venues_delete_admin ON public.venues
  USING ((select has_role(auth.uid(), 'admin'::app_role)));

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
ALTER POLICY events_insert_authenticated ON public.events
  WITH CHECK (
    ((select auth.uid()) = user_id)
    AND (status = 'pending'::event_status)
    AND (editors IS NULL)
    AND (hide = false)
  );

ALTER POLICY events_select_admin ON public.events
  USING (
    (select has_role(auth.uid(), 'admin'::app_role))
    OR (select has_role(auth.uid(), 'moderator'::app_role))
  );

-- The EXISTS stays correlated (it references events.id); only the auth.uid() inside it is hoisted.
ALTER POLICY events_select_own ON public.events
  USING (
    ((select auth.uid()) = user_id)
    OR (EXISTS (
      SELECT 1
      FROM (event_organizers eo JOIN profiles p ON ((p.id = eo.organizer_id)))
      WHERE ((eo.event_id = events.id) AND (p.user_id = (select auth.uid())))
    ))
  );

ALTER POLICY events_update ON public.events
  USING (
    ((select auth.uid()) = user_id)
    OR ((select auth.uid()) = ANY (editors))
    OR (select has_role(auth.uid(), 'admin'::app_role))
    OR (select has_role(auth.uid(), 'moderator'::app_role))
    OR (EXISTS (
      SELECT 1
      FROM (event_organizers eo JOIN profiles p ON ((p.id = eo.organizer_id)))
      WHERE ((eo.event_id = events.id) AND (p.user_id = (select auth.uid())))
    ))
  );

ALTER POLICY events_delete_admin ON public.events
  USING ((select has_role(auth.uid(), 'admin'::app_role)));

-- ---------------------------------------------------------------------------
-- event_organizers
-- ---------------------------------------------------------------------------
ALTER POLICY event_organizers_insert ON public.event_organizers
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM events e
      WHERE ((e.id = event_organizers.event_id)
        AND ((e.user_id = (select auth.uid())) OR ((select auth.uid()) = ANY (e.editors))))
    ))
    OR (select has_role(auth.uid(), 'admin'::app_role))
    OR (select has_role(auth.uid(), 'moderator'::app_role))
  );

ALTER POLICY event_organizers_update ON public.event_organizers
  USING (
    (EXISTS (
      SELECT 1 FROM events e
      WHERE ((e.id = event_organizers.event_id)
        AND ((e.user_id = (select auth.uid())) OR ((select auth.uid()) = ANY (e.editors))))
    ))
    OR (select has_role(auth.uid(), 'admin'::app_role))
    OR (select has_role(auth.uid(), 'moderator'::app_role))
  );

ALTER POLICY event_organizers_delete ON public.event_organizers
  USING (
    (EXISTS (
      SELECT 1 FROM events e
      WHERE ((e.id = event_organizers.event_id)
        AND ((e.user_id = (select auth.uid())) OR ((select auth.uid()) = ANY (e.editors))))
    ))
    OR (select has_role(auth.uid(), 'admin'::app_role))
  );

-- ---------------------------------------------------------------------------
-- event_teachers
-- is_event_organizer(event_id) is correlated (row's own event_id) — left as-is here; its body
-- is optimized at the bottom of this file instead.
-- ---------------------------------------------------------------------------
ALTER POLICY event_teachers_insert ON public.event_teachers
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM events e
      WHERE ((e.id = event_teachers.event_id)
        AND ((e.user_id = (select auth.uid())) OR ((select auth.uid()) = ANY (e.editors))))
    ))
    OR is_event_organizer(event_id)
    OR (select has_role(auth.uid(), 'admin'::app_role))
    OR (select has_role(auth.uid(), 'moderator'::app_role))
  );

ALTER POLICY event_teachers_update ON public.event_teachers
  USING (
    (EXISTS (
      SELECT 1 FROM events e
      WHERE ((e.id = event_teachers.event_id)
        AND ((e.user_id = (select auth.uid())) OR ((select auth.uid()) = ANY (e.editors))))
    ))
    OR is_event_organizer(event_id)
    OR (select has_role(auth.uid(), 'admin'::app_role))
    OR (select has_role(auth.uid(), 'moderator'::app_role))
  );

ALTER POLICY event_teachers_delete ON public.event_teachers
  USING (
    (EXISTS (
      SELECT 1 FROM events e
      WHERE ((e.id = event_teachers.event_id)
        AND ((e.user_id = (select auth.uid())) OR ((select auth.uid()) = ANY (e.editors))))
    ))
    OR is_event_organizer(event_id)
    OR (select has_role(auth.uid(), 'admin'::app_role))
    OR (select has_role(auth.uid(), 'moderator'::app_role))
    OR (EXISTS (
      SELECT 1 FROM profiles p
      WHERE ((p.id = event_teachers.teacher_id) AND (p.user_id = (select auth.uid())))
    ))
  );

-- ---------------------------------------------------------------------------
-- event_series
-- ---------------------------------------------------------------------------
ALTER POLICY event_series_insert_authenticated ON public.event_series
  WITH CHECK ((select auth.uid()) = created_by);

ALTER POLICY event_series_update_owner_or_admin ON public.event_series
  USING (
    ((select auth.uid()) = created_by)
    OR (select has_role(auth.uid(), 'admin'::app_role))
    OR (select has_role(auth.uid(), 'moderator'::app_role))
  );

ALTER POLICY event_series_delete_admin ON public.event_series
  USING ((select has_role(auth.uid(), 'admin'::app_role)));

-- ---------------------------------------------------------------------------
-- event_claims
-- ---------------------------------------------------------------------------
ALTER POLICY event_claims_select_own ON public.event_claims
  USING ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- user_roles
-- has_role() is SECURITY DEFINER precisely so it can read user_roles without re-entering this
-- policy (recursion guard) — wrapping it in a subquery does not change that.
-- ---------------------------------------------------------------------------
ALTER POLICY user_roles_select_admin ON public.user_roles
  USING (
    ((select auth.uid()) = user_id)
    OR (select has_role(auth.uid(), 'admin'::app_role))
  );

ALTER POLICY user_roles_manage_admin ON public.user_roles
  USING ((select has_role(auth.uid(), 'admin'::app_role)));

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
ALTER POLICY reports_admin_select ON public.reports
  USING ((select has_role(auth.uid(), 'admin'::app_role)));

ALTER POLICY reports_admin_update ON public.reports
  USING ((select has_role(auth.uid(), 'admin'::app_role)));

-- ---------------------------------------------------------------------------
-- admin-only ingest/ops tables
-- ---------------------------------------------------------------------------
ALTER POLICY import_jobs_admin_only ON public.import_jobs
  USING ((select has_role(auth.uid(), 'admin'::app_role)));

ALTER POLICY event_candidates_admin_only ON public.event_candidates
  USING ((select has_role(auth.uid(), 'admin'::app_role)));

ALTER POLICY raw_messages_admin_only ON public.raw_messages
  USING ((select has_role(auth.uid(), 'admin'::app_role)));

-- ---------------------------------------------------------------------------
-- is_event_organizer(): correlated at the call site (takes the row's event_id), so it can never
-- be hoisted by the policies above. Its *body*, however, re-evaluates auth.uid() per row of its
-- own inner join scan — same fix applied one level down. Body is otherwise unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_event_organizer(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.event_organizers eo
      JOIN public.profiles p ON p.id = eo.organizer_id
    WHERE eo.event_id = p_event_id AND p.user_id = (select auth.uid())
  )
$function$;
