-- I-165 Finding 3, Migration B: drop the three source columns.
--
-- THIS is the step that closes the exposure. Migration A was additive, so until now every address
-- existed twice: the gated copy in entity_emails, and an ungated copy in a column that `anon` could
-- still read straight off the Data API. Verified immediately before writing this, with the public
-- anon key:
--   GET /rest/v1/events?select=contact_email    -> 200, real addresses
--   GET /rest/v1/profiles?select=public_email   -> 200, real addresses
--   GET /rest/v1/venues?select=email            -> 200, real addresses
--
-- Safe to run because:
--   * All 396 non-empty source values were reconciled against entity_emails by value, not just by
--     count: zero missing, zero mismatched. The by-value check matters because the deployed app kept
--     writing these columns until 2026-09-01 16:44 CEST, ~50 minutes after Migration A backfilled.
--   * The deployed code no longer reads or writes them (commit 49d89f0).
--   * supabase/functions/* never referenced them.
--   * hermes (Pip) has an hourly job whose prompt sets contact_email via
--     PATCH /rest/v1/events, and PostgREST rejects a whole patch containing an unknown column.
--     That job is dormant: enrichment_tracker.csv last modified 2026-06-23, last commit 2026-07-30.
--     It must be pointed at entity_emails before it is switched back on.
--   * The remaining repo references are spent one-off enrichment scripts, CSV logs, and a CIGC
--     HTML form field that happens to be named contact_email.
--
-- No CASCADE, deliberately. If a view or function still depends on one of these columns, this
-- should fail loudly rather than silently drop the dependent object.
--
-- DROP COLUMN is catalog-only in Postgres (no table rewrite) and fires no row triggers, so unlike
-- Migration A there is no revalidation-webhook hazard here.

-- Re-run the reconciliation as an assertion, so this migration refuses to apply if anything was
-- written to a source column between the manual check and now.
DO $$
DECLARE
  unmigrated int;
BEGIN
  SELECT count(*) INTO unmigrated FROM (
    SELECT e.id FROM public.events e
      WHERE e.contact_email IS NOT NULL AND btrim(e.contact_email) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM public.entity_emails x
           WHERE x.entity_type = 'event' AND x.entity_id = e.id
             AND lower(x.email) = lower(btrim(e.contact_email)))
    UNION ALL
    SELECT p.id FROM public.profiles p
      WHERE p.public_email IS NOT NULL AND btrim(p.public_email) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM public.entity_emails x
           WHERE x.entity_type = 'profile' AND x.entity_id = p.id
             AND lower(x.email) = lower(btrim(p.public_email)))
    UNION ALL
    SELECT v.id FROM public.venues v
      WHERE v.email IS NOT NULL AND btrim(v.email) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM public.entity_emails x
           WHERE x.entity_type = 'venue' AND x.entity_id = v.id
             AND lower(x.email) = lower(btrim(v.email)))
  ) t;

  IF unmigrated > 0 THEN
    RAISE EXCEPTION
      'I-165 F3 Migration B aborted: % source rows hold an address that entity_emails does not have '
      'with a matching value. Dropping now would lose them. Reconcile first.', unmigrated;
  END IF;
END $$;

ALTER TABLE public.events   DROP COLUMN contact_email;
ALTER TABLE public.profiles DROP COLUMN public_email;
ALTER TABLE public.venues   DROP COLUMN email;
