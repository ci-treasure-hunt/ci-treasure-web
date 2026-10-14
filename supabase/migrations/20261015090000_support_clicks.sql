-- I-173 option F (supporter income): count clicks on the support link by where they came from, so
-- the nudges (event submission, approval email) can be compared against the footer baseline.
-- Buy Me a Coffee does not report referrers, so /support?from=<source> records one row and
-- redirects there.
--
-- No personal data: no IP, no user agent, no user id. Only the source label and the time.
-- Written by the /support route with the service-role client only; anon and authenticated get no
-- access at all, so RLS is on with no policies.
--
-- Known noise: email security scanners prefetch links, so approval_email counts run high. Compare
-- trends and sources, not absolute numbers.

create table public.support_clicks (
  id bigint generated always as identity primary key,
  source text not null check (source ~ '^[a-z_]{1,32}$'),
  created_at timestamptz not null default now()
);

alter table public.support_clicks enable row level security;
revoke all on public.support_clicks from anon, authenticated;

-- Rollback: drop table public.support_clicks;
