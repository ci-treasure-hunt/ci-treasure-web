-- I-165 Finding 3, Migration A (additive only).
--
-- Moves contact addresses out of the public tables into a deny-all `entity_emails` table.
-- Background: RLS is row-level, so `anon` holding table-level SELECT on events/profiles/venues
-- meant `GET /rest/v1/events?select=contact_email` returned every published event's address,
-- bypassing the Turnstile gate, the 20/day rate limit and `email_reveal_log` entirely.
--
-- Column-level REVOKE was designed first and rejected: column privileges are ADDITIVE with the
-- table grant, so a column REVOKE is a silent no-op, and the only working form requires re-granting
-- every other column. That leaves a permanent footgun (a newly added column is invisible to `anon`
-- until granted, and a future routine `GRANT SELECT ON <table>` silently reopens the hole).
--
-- This migration is deliberately additive. The three source columns are NOT dropped here; that is
-- Migration B, after the code reading this table is deployed and verified, so the window between
-- them is a safe rollback window. Full design: ci-treasure-hunt/docs/issues/i-165-security-review-2.md
--
-- ORDER MATTERS HERE. events/profiles/venues/communities all carry `trigger_revalidate()` as an
-- AFTER INSERT OR UPDATE ... FOR EACH ROW trigger that does a `net.http_post` to
-- citreasurehunt.com/api/revalidate per row. A naive backfill would fire ~389 of them and burn most
-- of a day's Vercel ISR quota, which is exactly the I-161 problem. So: backfill BEFORE the sync
-- trigger exists, and suppress revalidation around the single bulk flag update. No revalidation is
-- warranted anyway, since nothing rendered changes until the code deploy.

-- 1. The table --------------------------------------------------------------------------------

create table if not exists public.entity_emails (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('event', 'profile', 'venue', 'community')),
  entity_id   uuid not null,
  email       text not null check (position('@' in email) > 1),
  -- 'airtable' marks rows a sync owns and may delete. Anything else is manually curated and must
  -- survive a sync. Communities are Airtable-authoritative and their addresses were added there
  -- ahead of any sync support, so without this a future sync stale-row cleanup (the same shape as
  -- the one community_invites already has) would delete every hand-curated address on first run.
  source      text not null default 'manual',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (entity_type, entity_id)
);

comment on table public.entity_emails is
  'I-165 F3. Contact addresses for events/profiles/venues/communities. Deny-all to anon and authenticated by design: read it only through lib/protected-email-action.ts, which gates on Turnstile plus a 20/day IP-hash rate limit and logs to email_reveal_log. No foreign key is possible (entity_id is polymorphic); parent deletes are handled by delete_entity_emails().';

-- 2. Lockdown ---------------------------------------------------------------------------------
-- Both routes, not one. RLS-with-no-policies alone is how community_invites protects itself and it
-- works, but Supabase ships `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated`,
-- so that table still carries full grants and is one stray permissive policy away from being open.
-- The REVOKE below is therefore required, not decorative.

alter table public.entity_emails enable row level security;
revoke all on public.entity_emails from anon, authenticated;
-- No policies, deliberately. service_role bypasses RLS.

-- Same one-line hardening for the existing service-role-only tables, which carry the same default
-- grants for the same reason. All three are only ever read and written by the service role.
revoke all on public.community_invites from anon, authenticated;
revoke all on public.invite_reveal_log from anon, authenticated;
revoke all on public.email_reveal_log  from anon, authenticated;

-- 3. Existence flags ---------------------------------------------------------------------------
-- The public pages never render these addresses; they branch only on whether one exists, to decide
-- whether to show the "Show email" button. Same shape as communities.has_invites, which already
-- solves this for invite links. ADD COLUMN with a constant default does not fire row triggers.

alter table public.events      add column if not exists has_email boolean not null default false;
alter table public.profiles    add column if not exists has_email boolean not null default false;
alter table public.venues      add column if not exists has_email boolean not null default false;
alter table public.communities add column if not exists has_email boolean not null default false;

-- 4. Backfill, before the sync trigger exists ---------------------------------------------------

insert into public.entity_emails (entity_type, entity_id, email, source)
select 'event', id, btrim(contact_email), 'backfill'
  from public.events   where contact_email is not null and btrim(contact_email) <> ''
union all
select 'profile', id, btrim(public_email), 'backfill'
  from public.profiles where public_email  is not null and btrim(public_email)  <> ''
union all
select 'venue', id, btrim(email), 'backfill'
  from public.venues   where email         is not null and btrim(email)         <> ''
on conflict (entity_type, entity_id) do nothing;

-- 5. Flag the backfilled rows without waking the revalidation webhook ---------------------------

alter table public.events   disable trigger on_events_write_revalidate;
alter table public.profiles disable trigger on_profiles_write_revalidate;
alter table public.venues   disable trigger on_venues_write_revalidate;

update public.events e set has_email = true
 where exists (select 1 from public.entity_emails x
                where x.entity_type = 'event' and x.entity_id = e.id);
update public.profiles p set has_email = true
 where exists (select 1 from public.entity_emails x
                where x.entity_type = 'profile' and x.entity_id = p.id);
update public.venues v set has_email = true
 where exists (select 1 from public.entity_emails x
                where x.entity_type = 'venue' and x.entity_id = v.id);

alter table public.events   enable trigger on_events_write_revalidate;
alter table public.profiles enable trigger on_profiles_write_revalidate;
alter table public.venues   enable trigger on_venues_write_revalidate;

-- 6. Keep the flags true from here on ----------------------------------------------------------

create or replace function public.refresh_entity_has_email(p_type text, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  tbl text := case p_type
                when 'event'     then 'events'
                when 'profile'   then 'profiles'
                when 'venue'     then 'venues'
                when 'community' then 'communities'
              end;
begin
  if tbl is null or p_id is null then
    return;
  end if;
  -- The `is distinct from` guard makes this a no-op when the flag is already correct, so an
  -- unrelated email edit does not fire trigger_revalidate() for nothing.
  execute format(
    'update public.%I t set has_email = e.present
       from (select exists (select 1 from public.entity_emails
                             where entity_type = $1 and entity_id = $2) as present) e
      where t.id = $2 and t.has_email is distinct from e.present', tbl)
    using p_type, p_id;
end;
$$;

create or replace function public.entity_emails_sync_flag()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Handles a row moving between entities, which would otherwise leave the old parent stale.
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_entity_has_email(old.entity_type, old.entity_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_entity_has_email(new.entity_type, new.entity_id);
  end if;
  return null;
end;
$$;

drop trigger if exists entity_emails_sync_flag on public.entity_emails;
create trigger entity_emails_sync_flag
after insert or update or delete on public.entity_emails
for each row execute function public.entity_emails_sync_flag();

-- 7. Parent deletes ----------------------------------------------------------------------------
-- Stands in for the foreign key that a polymorphic entity_id cannot have. The cascading delete
-- fires entity_emails_sync_flag, whose UPDATE then matches zero rows because the parent is already
-- gone, which is harmless.

create or replace function public.delete_entity_emails()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.entity_emails
   where entity_type = tg_argv[0] and entity_id = old.id;
  return old;
end;
$$;

drop trigger if exists events_delete_emails on public.events;
create trigger events_delete_emails after delete on public.events
for each row execute function public.delete_entity_emails('event');

drop trigger if exists profiles_delete_emails on public.profiles;
create trigger profiles_delete_emails after delete on public.profiles
for each row execute function public.delete_entity_emails('profile');

drop trigger if exists venues_delete_emails on public.venues;
create trigger venues_delete_emails after delete on public.venues
for each row execute function public.delete_entity_emails('venue');

drop trigger if exists communities_delete_emails on public.communities;
create trigger communities_delete_emails after delete on public.communities
for each row execute function public.delete_entity_emails('community');
