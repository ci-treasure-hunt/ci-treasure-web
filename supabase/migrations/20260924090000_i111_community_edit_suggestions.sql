-- I-111 Stage 2: "Suggest an edit" on community pages, replacing the Airtable
-- "Report an Issue or Suggest an Edit" form.
--
-- Service role only: written by lib/community-suggest-action.ts, read and resolved in
-- /admin/communities/edits. RLS on with no policies, and every grant revoked from anon and
-- authenticated, so the table is invisible through PostgREST even if a policy is added by mistake.
-- Suggestions can carry private group invite links and a submitter's contact, which is why this is
-- stricter than a public-insert table.

create table public.community_edit_suggestions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  request_type text not null check (request_type in
    ('broken_link', 'outdated_info', 'duplicate', 'remove', 'other')),
  fields text[] not null default '{}',
  new_value text not null,
  contact text,
  ip_hash text,
  status text not null default 'open' check (status in ('open', 'applied', 'dismissed')),
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index community_edit_suggestions_status_created_idx
  on public.community_edit_suggestions (status, created_at);

alter table public.community_edit_suggestions enable row level security;

revoke all on public.community_edit_suggestions from anon, authenticated;

-- Link-sharing consent from the public Add form. approveCommunity() makes a community's group
-- invites revealable only when this is true, so a community added any other way (the /addcommunity
-- skill, the admin editor) never has its invites published by the Approve button: those still
-- need the per-link consent decision. Not in the anon column grants (20260923090000 whitelists
-- columns), so it is private by default.
alter table public.communities
  add column links_consent boolean not null default false;

-- Rollback: drop table public.community_edit_suggestions;
--           alter table public.communities drop column links_consent;
