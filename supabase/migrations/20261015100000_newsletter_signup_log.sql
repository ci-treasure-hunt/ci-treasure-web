-- I-160: rate limit for our own newsletter form (replaces the EmailOctopus embed and its Google
-- reCAPTCHA). Same pattern as invite_reveal_log: a daily-rotating hash of the IP, never the IP or
-- the email address itself. The address goes to EmailOctopus only.
--
-- Written by the /newsletter server action with the service-role client only; RLS on with no
-- policies, and no grants for anon or authenticated.

create table public.newsletter_signup_log (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index on public.newsletter_signup_log (ip_hash, created_at);

alter table public.newsletter_signup_log enable row level security;
revoke all on public.newsletter_signup_log from anon, authenticated;

-- Rollback: drop table public.newsletter_signup_log;
