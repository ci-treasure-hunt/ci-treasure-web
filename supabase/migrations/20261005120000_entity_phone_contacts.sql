-- Gated phone-based contacts (WhatsApp / Telegram-by-number / Signal-by-number / plain phone).
--
-- Decided 2026-10-04/05 (NdLg, QVDX): some organizers publish only a messenger number as their way to
-- register. A wa.me / t.me/+ / signal.me/#p/+ link carries the number in plain text, so putting it
-- in a public `links` item would hand it to scrapers, while email addresses already sit behind the
-- Turnstile-gated reveal (I-165 F3). The sensitive thing is the phone number, not the platform:
-- username links (t.me/<username>, Signal username links) stay public like any social handle.
--
-- Deliberately a sibling of entity_emails rather than a widening of it: entity_emails is unique per
-- entity and checks for '@', while a festival can list several contacts, each with a label. Same
-- lockdown pattern otherwise, copied from 20260901140000_i165_f3_entity_emails.sql.

-- 1. The table --------------------------------------------------------------------------------

create table if not exists public.entity_phone_contacts (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('event', 'profile', 'venue', 'community')),
  entity_id   uuid not null,
  -- 'phone' renders as a tel: link (call or text), the others as their messenger deep link.
  channel     text not null check (channel in ('whatsapp', 'telegram', 'signal', 'phone')),
  -- International format, digits only, no '+': what wa.me expects, and the reveal adds the '+'
  -- where the other link formats need it.
  number      text not null check (number ~ '^[1-9][0-9]{6,14}$'),
  -- Shown on the revealed link, e.g. a first name when an event lists several contacts.
  label       text,
  source      text not null default 'manual',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (entity_type, entity_id, channel, number)
);

create index if not exists entity_phone_contacts_entity_idx
  on public.entity_phone_contacts (entity_type, entity_id);

comment on table public.entity_phone_contacts is
  'Phone-based contacts (whatsapp/telegram/signal/phone) for events/profiles/venues/communities. Deny-all to anon and authenticated: read only through lib/protected-phone-contact-action.ts (Turnstile, shared 20/day IP-hash limit, email_reveal_log). Only numbers an organizer published themselves for contact.';

-- 2. Lockdown (both routes, same reasoning as entity_emails) -----------------------------------

alter table public.entity_phone_contacts enable row level security;
revoke all on public.entity_phone_contacts from anon, authenticated;

-- 3. Existence flags ---------------------------------------------------------------------------

alter table public.events      add column if not exists has_phone_contacts boolean not null default false;
alter table public.profiles    add column if not exists has_phone_contacts boolean not null default false;
alter table public.venues      add column if not exists has_phone_contacts boolean not null default false;
alter table public.communities add column if not exists has_phone_contacts boolean not null default false;

-- venues and communities use column-level SELECT grants (I-111 and the venues admin_notes work), so
-- a new column is invisible to the public pages until granted. events and profiles grant at table
-- level and need nothing.
grant select (has_phone_contacts) on public.venues      to anon, authenticated;
grant select (has_phone_contacts) on public.communities to anon, authenticated;

-- 4. Keep the flags true -----------------------------------------------------------------------
-- The table starts empty, so unlike entity_emails there is no backfill and no revalidation storm
-- to suppress.

create or replace function public.refresh_entity_has_phone_contacts(p_type text, p_id uuid)
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
  execute format(
    'update public.%I t set has_phone_contacts = e.present
       from (select exists (select 1 from public.entity_phone_contacts
                             where entity_type = $1 and entity_id = $2) as present) e
      where t.id = $2 and t.has_phone_contacts is distinct from e.present', tbl)
    using p_type, p_id;
end;
$$;

create or replace function public.entity_phone_contacts_sync_flag()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_entity_has_phone_contacts(old.entity_type, old.entity_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_entity_has_phone_contacts(new.entity_type, new.entity_id);
  end if;
  return null;
end;
$$;

drop trigger if exists entity_phone_contacts_sync_flag on public.entity_phone_contacts;
create trigger entity_phone_contacts_sync_flag
after insert or update or delete on public.entity_phone_contacts
for each row execute function public.entity_phone_contacts_sync_flag();

-- Same treatment I-158 gave refresh_entity_has_email: otherwise any anon caller could hit it via
-- /rest/v1/rpc. The SECURITY DEFINER trigger runs as the owner, so revoking does not break it.
revoke execute on function public.refresh_entity_has_phone_contacts(text, uuid) from public, anon, authenticated;
grant  execute on function public.refresh_entity_has_phone_contacts(text, uuid) to service_role;

-- 5. Parent deletes ----------------------------------------------------------------------------

create or replace function public.delete_entity_phone_contacts()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.entity_phone_contacts
   where entity_type = tg_argv[0] and entity_id = old.id;
  return old;
end;
$$;

drop trigger if exists events_delete_phone_contacts on public.events;
create trigger events_delete_phone_contacts after delete on public.events
for each row execute function public.delete_entity_phone_contacts('event');

drop trigger if exists profiles_delete_phone_contacts on public.profiles;
create trigger profiles_delete_phone_contacts after delete on public.profiles
for each row execute function public.delete_entity_phone_contacts('profile');

drop trigger if exists venues_delete_phone_contacts on public.venues;
create trigger venues_delete_phone_contacts after delete on public.venues
for each row execute function public.delete_entity_phone_contacts('venue');

drop trigger if exists communities_delete_phone_contacts on public.communities;
create trigger communities_delete_phone_contacts after delete on public.communities
for each row execute function public.delete_entity_phone_contacts('community');
