-- Security review 2026-09-05: profiles.visibility was the one privileged column not covered by
-- protect_profile_privileged_columns (20260717223555), and the RLS update policy
-- (profiles_update_owner_or_admin) places no restriction on what an owner may write.
--
-- The only sanctioned owner write is setProfileDeactivated's reversible
-- public <-> deactivated toggle (20260714174305: "deactivated is a reversible, user-chosen
-- state ... suspended is reserved for a future admin-imposed moderation action"). But as a
-- registered Server Action, that toggle is a public HTTP endpoint regardless of the page that
-- renders it (same reasoning as I-166 F2), so `deactivated=false` sent by any signed-in user
-- could:
--   * publish a profile still awaiting admin review — self-submitted profiles are inserted as
--     'shadow' precisely so an admin can review them first (I-150 / I-165 profiles INSERT
--     guard, 20260831120000), and claim-approval flows set 'public' only from the service-role
--     client; or
--   * flip a 'suspended' (admin moderation) profile back to live.
--
-- The app action now validates the transition itself; this trigger is the actual guarantee,
-- same reasoning as the is_trusted/show_in_list guards: app-layer checks are convention, RLS+
-- trigger is the guarantee. Admins and service_role keep full control (claim approval, pending
-- review, suspension all run through the admin/service-role client, which this trigger
-- explicitly returns early for). The session_user = 'postgres' escape clause from
-- 20260717224116 is preserved — direct superuser SQL (Supabase MCP / SQL editor) must stay
-- able to set visibility, and that clause is unreachable from PostgREST-originated requests.

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF session_user = 'postgres'
     OR auth.role() = 'service_role'
     OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_trusted IS DISTINCT FROM OLD.is_trusted THEN
    NEW.is_trusted := OLD.is_trusted;
  END IF;
  IF NEW.show_in_list IS DISTINCT FROM OLD.show_in_list THEN
    NEW.show_in_list := OLD.show_in_list;
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
$$;

-- CREATE OR REPLACE FUNCTION does not rewrite an existing trigger's binding, but the trigger
-- references the function by name, so the body swap takes effect as-is. Drop/recreate anyway to
-- keep the trigger definition explicit and idempotent under re-runs.
DROP TRIGGER IF EXISTS protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER protect_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();
