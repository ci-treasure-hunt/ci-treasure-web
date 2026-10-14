-- I-074 follow-up: drop profiles.show_in_list.
--
-- The column was filled once by a bulk UPDATE on 2026-07-10 and never maintained. Since 2026-09-20
-- nothing in the application reads it: /teachers, its crawlable index and the site stats all derive
-- who is listed via getListedPeople(). Keeping a dead flag invites someone to filter on it again,
-- which is how the index drifted from the list in the first place.
--
-- venues.show_in_list is a different, live curation flag (/venues and the country pages) and stays.
--
-- Two guards referenced the column and are rewritten here without it, otherwise the DROP fails:
-- the insert policy from 20260831120000 and the privileged-columns trigger from 20260910110811.

DROP POLICY IF EXISTS profiles_insert_authenticated ON public.profiles;

CREATE POLICY profiles_insert_authenticated ON public.profiles
  FOR INSERT
  WITH CHECK (
    (select auth.uid()) = user_id
    AND is_trusted = false
    AND visibility = 'shadow'::profile_visibility
    AND image_status = 'pending'
  );

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF session_user = 'postgres'
     OR auth.role() = 'service_role'
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_trusted IS DISTINCT FROM OLD.is_trusted THEN
    NEW.is_trusted := OLD.is_trusted;
  END IF;

  -- Only the reversible public <-> deactivated pair is owner-toggleable. Everything else —
  -- shadow/claimed (awaiting review), suspended (admin-imposed), or any transition out of
  -- those states — reverts to the stored value.
  IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
    IF NOT (
      OLD.visibility IN ('public', 'deactivated')
      AND NEW.visibility IN ('public', 'deactivated')
    ) THEN
      NEW.visibility := OLD.visibility;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

ALTER TABLE public.profiles DROP COLUMN show_in_list;
