-- I-192 stage 3: the three-step event flow (docs/issues/i-192-submitter-roles-add-flow.md in the
-- ci-treasure-hunt repo). An event can now be submitted without an account and is saved as
-- pending before anyone signs in. This table holds what the submission says about the person
-- submitting it, which must never sit on the public events row:
--
--   roles       what the submitter is at this event: any of 'organizer', 'teacher'; empty means
--               they are passing it on ("just sharing"). Both can be set (organize and teach).
--   email       a signed-out submitter's own address, optional, only for questions (privacy
--               policy, event submissions section). Never shown, never in a Telegram ping (I-159).
--   user_id     the account, when the submitter was signed in or signed in afterwards to claim it.
--   source_url  the event page / Facebook event / Telegram post the submission came from.
--   pasted_text the post text they pasted, for review only.
--
-- Written and read only server-side with the service role (submit action, admin pending queue).
-- RLS on with no policies, and no grants to anon/authenticated, same as other internal tables.

create table public.event_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  roles text[] not null default '{}',
  email text,
  user_id uuid references auth.users(id) on delete set null,
  source_url text,
  pasted_text text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint event_submissions_roles_valid check (roles <@ array['organizer', 'teacher']::text[]),
  constraint event_submissions_email_len check (email is null or char_length(email) <= 200),
  constraint event_submissions_pasted_len check (pasted_text is null or char_length(pasted_text) <= 5000)
);

comment on table public.event_submissions is
  'I-192: who submitted an event and in which role (organizer/teacher/sharer), with the source link '
  'and pasted text. Internal: service role only, never shown publicly.';

create index event_submissions_event_id_idx on public.event_submissions (event_id);
create index event_submissions_created_at_idx on public.event_submissions (created_at);

alter table public.event_submissions enable row level security;
revoke all on public.event_submissions from anon, authenticated;
