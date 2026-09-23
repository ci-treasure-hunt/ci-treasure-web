-- I-111 Stage 1, step 2: prepare `communities` to become Supabase-authoritative.
--
-- Ships before the new forms/admin UI, and is safe alongside the still-running daily Airtable sync
-- (scripts/sync_communities.py in ci-treasure-hunt): the sync writes with the service role, which
-- bypasses grants and RLS; it never sends `status` (existing and newly synced rows default to
-- 'published'); and it still supplies `airtable_id` and `synced_at`. Nothing visible changes on the
-- site. The cutover itself (sync retired, `verified` dropped, `airtable_updated_at` revoked) is a
-- second, later migration.
--
-- Precondition, already deployed (ci-treasure-web 63b1fbb): the community detail page no longer
-- selects verified / audience_size / friendliness / contact_person. PostgREST rejects a select
-- that names an ungranted column (42501), so that had to go out first.

-- 1. Rows can now originate in Supabase (public Add form), with no Airtable record behind them.
--    The UNIQUE constraint on airtable_id stays: NULLs don't collide.
alter table public.communities alter column airtable_id drop not null;
alter table public.communities alter column synced_at drop not null;

-- 2. Moderation status, same three values `events` uses. Existing rows become 'published'.
--    ADD COLUMN with a constant default doesn't rewrite rows or fire row triggers.
alter table public.communities
  add column status text not null default 'published'
  check (status in ('pending', 'published', 'rejected'));

-- 3. Internal fields for the public Add form and the admin queue.
alter table public.communities add column submitter_contact text;
alter table public.communities add column admin_notes text;

comment on column public.communities.submitter_contact is
  'Optional free-text name/contact of whoever submitted the community via the public form. Internal only.';
comment on column public.communities.admin_notes is
  'Internal admin note, e.g. a rejection reason. Internal only, never granted to anon/authenticated.';
comment on column public.communities.audience_size is
  'Internal estimate: chat group size where one exists, otherwise the (usually much larger) Facebook group size. Not comparable across rows, so not shown publicly.';

-- 4. Own timestamps, replacing the Airtable ones once the sync is retired (sitemap lastModified).
--    Backfilled with the per-row revalidate webhook disabled: it fires one net.http_post per row,
--    and ~300 of them would burn ISR quota for a change nothing public reads yet.
alter table public.communities add column created_at timestamptz;
alter table public.communities add column updated_at timestamptz;

alter table public.communities disable trigger on_communities_write_revalidate;
update public.communities
set created_at = coalesce(airtable_created_at, synced_at, now()),
    updated_at = coalesce(airtable_updated_at, synced_at, now());
alter table public.communities enable trigger on_communities_write_revalidate;

alter table public.communities alter column created_at set default now();
alter table public.communities alter column created_at set not null;
alter table public.communities alter column updated_at set default now();
alter table public.communities alter column updated_at set not null;

create trigger trg_communities_updated_at
before update on public.communities
for each row execute function public.update_updated_at_column();

-- 5. Public read: only published, non-deleted rows. Pending and rejected submissions stay
--    service-role only (admin pages).
drop policy communities_public_read on public.communities;
create policy communities_public_read on public.communities
  for select to anon, authenticated
  using (deleted_at is null and status = 'published');

-- 6. Column-level grants, same pattern as 20260910110821_venues_admin_notes_grants.sql.
--    Until now anon/authenticated held table-level SELECT on every column, so contact_person
--    (a named person on ~125 rows, never rendered), friendliness and audience_size were readable
--    straight off the Data API. A column-scoped REVOKE is a no-op against a table-level grant, so
--    the table grant is replaced with a whitelist. Fail closed: a future column stays invisible to
--    anon/authenticated until granted here.
--
--    Write privileges are revoked too. No anon/authenticated code path writes communities (every
--    writer uses the service-role client), and no RLS policy permitted a write anyway; this just
--    stops relying on RLS alone. Unlike venues, which kept its write grants.
--
--    Checked 2026-09-23 against every anon read path: lib/communities.ts (list, detail, ring,
--    country lookups, previous_slugs redirect), the community embeds in lib/events.ts,
--    lib/teachers.ts and lib/venues.ts (slug, name, type, city, description, deleted_at),
--    app/sitemap.ts (slug, airtable_updated_at), invite-links-action.ts and
--    protected-email-action.ts (id). All selected and filtered columns are in the list below.
--    The only DB function referencing communities (refresh_entity_has_email) is SECURITY DEFINER.
revoke select, insert, update, delete, truncate on public.communities from anon, authenticated;

grant select (
    id,
    name,
    slug,
    type,
    city,
    country,
    region,
    continent,
    address_for_map,
    lat,
    lng,
    description,
    focus,
    activity_level,
    languages,
    website,
    instagram,
    facebook_group,
    facebook_page,
    telegram_group,
    telegram_channel,
    whatsapp_channel,
    youtube,
    calendar,
    newsletter,
    other_resource,
    has_invites,
    has_telegram_invite,
    has_whatsapp_invite,
    has_signal_invite,
    has_line_invite,
    has_email,
    previous_slugs,
    deleted_at,
    status,
    created_at,
    updated_at,
    -- Temporary: app/sitemap.ts reads it with the anon key until the cutover deploy switches it
    -- to updated_at. Revoked in the cutover migration.
    airtable_updated_at
) on public.communities to anon, authenticated;

-- Deliberately not granted (internal): admin_notes, submitter_contact, contact_person,
-- friendliness, audience_size, verified, last_verified, airtable_id, synced_at,
-- airtable_created_at.
--
-- Rollback if a public page breaks: `grant select on public.communities to anon, authenticated;`
-- restores the previous table-level read immediately (and re-exposes the internal columns).
