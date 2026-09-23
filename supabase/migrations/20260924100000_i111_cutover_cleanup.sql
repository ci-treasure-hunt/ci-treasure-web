-- I-111 cutover cleanup, pushed after the Airtable sync was retired (2026-09-24) and the site
-- deployed with the sitemap reading communities.updated_at.
--
-- 1. airtable_updated_at was granted to anon only as a stopgap for the sitemap (20260923090000).
--    Nothing public reads it any more, so it joins the other internal Airtable columns.
-- 2. verified is dropped (Jan, 2026-09-23): the badge was removed in Stage 1, and the only writer
--    was the Airtable sync. No view or function depends on it (checked 2026-09-24).
--
-- airtable_id, synced_at and airtable_created_at stay as a record of where each row came from.

revoke select (airtable_updated_at) on public.communities from anon, authenticated;

alter table public.communities drop column verified;

-- Rollback: alter table public.communities add column verified boolean not null default false;
--           grant select (airtable_updated_at) on public.communities to anon, authenticated;
-- (the old verified values are in backups/airtable/ and backups/supabase/<date>/communities.json)
