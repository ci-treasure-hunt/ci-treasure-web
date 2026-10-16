-- Gated chat-group invite links for venues, the venue sibling of community_invites (I-099).
--
-- Decided 2026-10-16 (JT Forest, Chiang Mai): some venues run their own WhatsApp/Telegram group for
-- everything happening there. That link belongs on the venue page, not on each event, and like a
-- community invite it is token-bearing: anyone holding it can join, so it must not sit in public
-- `links`. Same lockdown as community_invites: no anon/authenticated access at all, read only by
-- the Turnstile-gated getVenueInviteLinks server action (lib/invite-links-action.ts).
--
-- Unlike community_invites there is no sync script and no has_* flag: the venue page asks the
-- service-role helper which platforms are published, as the community page already does.

create table if not exists public.venue_invites (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues(id) on delete cascade,
  platform   text not null check (platform in ('telegram', 'whatsapp', 'signal', 'line')),
  url        text not null,
  -- Trust-first, as on community_invites: nothing is revealed until an admin confirms the venue
  -- shares the link publicly (its own post, or the venue asked us to list it).
  published  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, platform)
);

comment on table public.venue_invites is
  'Chat-group invite links for venues. Deny-all to anon and authenticated: read only through lib/invite-links-action.ts (Turnstile, shared 20/day IP-hash limit, invite_reveal_log). Only links the venue shares publicly.';

alter table public.venue_invites enable row level security;
revoke all on public.venue_invites from anon, authenticated;

-- The reveal log rate-limits by ip_hash across both kinds of reveal, so a venue reveal is one row
-- here too, pointing at the venue instead of a community.
alter table public.invite_reveal_log
  alter column community_id drop not null,
  add column if not exists venue_id uuid references public.venues(id) on delete cascade;

alter table public.invite_reveal_log
  add constraint invite_reveal_log_one_target check (num_nonnulls(community_id, venue_id) = 1);
