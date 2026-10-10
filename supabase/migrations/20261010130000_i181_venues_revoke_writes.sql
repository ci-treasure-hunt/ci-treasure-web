-- I-181 (found while adding venue submissions): any signed-in user could write venues straight
-- through the Data API. venues_insert_authenticated only checks `auth.uid() = user_id`, so
--   POST /rest/v1/venues {"name": "...", "user_id": "<own uid>", "visibility": "public", "show_in_list": true}
-- created a public venue page on the curated /venues list, with any description and links,
-- skipping review. venues_update_owner_or_admin then let that user keep editing it.
--
-- No app code path needs these grants: every venue write goes through the service-role client
-- (app/api/admin/venues, app/admin/venues/page.tsx, lib/venue-submit.ts and the event-form
-- auto-pin in lib/geocode.ts), which bypasses grants and RLS. Same fix as communities in
-- 20260923090000: revoke writes from anon/authenticated and stop relying on RLS alone. Reads are
-- untouched (column whitelist from 20260910110821).
--
-- When venue claiming exists (Phase 3), owner edits go through a server action like profile
-- edits do, not through restored table grants.

revoke insert, update, delete, truncate on public.venues from anon, authenticated;

drop policy if exists venues_insert_authenticated on public.venues;
drop policy if exists venues_update_owner_or_admin on public.venues;
drop policy if exists venues_delete_admin on public.venues;

-- Rollback: grant insert, update, delete on public.venues to anon, authenticated; and recreate the
-- three policies from 20260717223555 / 20260812093000.
