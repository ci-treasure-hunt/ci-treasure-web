-- Security review 2026-09-05: venues.admin_notes is internal-only ("Internal-only note field
-- for venues ... for admin context only — e.g. who to contact once venue claiming exists",
-- 20260720210621), but venues_select_public (initial schema) is FOR SELECT USING (true), so the
-- column has been readable by anonymous callers with the public anon key the whole time:
--   GET /rest/v1/venues?select=admin_notes   -> 200, every admin-written note
-- The same class of exposure I-165 F3 closed for contact_email (column readable straight off
-- the Data API), just for admin notes instead of addresses.
--
-- Fix: column-level grants. Postgres has no column-scoped REVOKE against a table-level grant,
-- so the table-level SELECT grant is replaced with a whitelist of every non-admin_notes column.
--
-- Safe because every privileged reader/writer of admin_notes goes through the service-role
-- client, which bypasses grants and RLS entirely:
--   * app/admin/venues/page.tsx (list)          — createAdminClient()
--   * app/admin/venues/[id]/edit/page.tsx:16    — createAdminClient()
--   * app/api/admin/venues/route.ts + [id]/route.ts (write) — createAdminClient()
-- Every public/session-client venue query selects only columns in the whitelist below
-- (getVenueBySlug now names its columns explicitly instead of select *, so no query depends on
-- PostgREST's wildcard behaviour under column privileges), including the event-detail page's
-- venues(name, address, slug, visibility) join and geocode's id/lat/lng lookup, so no app read
-- path changes behaviour.
--
-- No SELECT grant on admin_notes exists for anon/authenticated afterwards: the column stays
-- readable only by service_role (default privileges). Future columns added to venues default to
-- invisible to anon/authenticated until granted — fail closed, which is the right default.

REVOKE SELECT ON public.venues FROM anon, authenticated;

GRANT SELECT (
    id,
    user_id,
    name,
    slug,
    address,
    city,
    country,
    region,
    lat,
    lng,
    website,
    description,
    image_url,
    image_credit,
    newsletter,
    facebook,
    instagram,
    youtube,
    links,
    visibility,
    show_in_list,
    show_in_announce,
    announce_name,
    previous_slugs,
    has_email,
    created_at,
    updated_at
) ON public.venues TO anon, authenticated;
