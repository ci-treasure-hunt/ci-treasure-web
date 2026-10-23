-- Gated chat-group invite links for profiles, the profile sibling of community_invites (I-099) and
-- venue_invites (20261016140000).
--
-- Decided 2026-10-23 (Richard Parker, Stroud): a teacher's own WhatsApp/Telegram group for their
-- classes belongs on their profile when the city already has a general community, not in a new
-- community entry. Profiles had no gated place for it, so the link would have sat openly in
-- `telegram` or `links` (two profiles already did, both moved here by hand after this migration).
-- Same lockdown as the other two: no anon/authenticated access at all, read only by the
-- Turnstile-gated getProfileInviteLinks server action (lib/invite-links-action.ts).
--
-- Written by the profile owner from /dashboard/profile/edit (published = true: the owner adding
-- their own group is the consent) or by an admin directly (published defaults to false).

create table if not exists public.profile_invites (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform   text not null check (platform in ('telegram', 'whatsapp', 'signal', 'line')),
  url        text not null,
  published  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, platform)
);

comment on table public.profile_invites is
  'Chat-group invite links for profiles. Deny-all to anon and authenticated: read only through lib/invite-links-action.ts (Turnstile, shared 20/day IP-hash limit, invite_reveal_log), written by the owner via the dashboard server action (service role, scoped to the caller''s own profile).';

alter table public.profile_invites enable row level security;
revoke all on public.profile_invites from anon, authenticated;

-- One reveal log for all three kinds, so the 20/day IP-hash limit stays shared.
alter table public.invite_reveal_log
  add column if not exists profile_id uuid references public.profiles(id) on delete cascade;

alter table public.invite_reveal_log
  drop constraint if exists invite_reveal_log_one_target;

alter table public.invite_reveal_log
  add constraint invite_reveal_log_one_target check (num_nonnulls(community_id, venue_id, profile_id) = 1);
