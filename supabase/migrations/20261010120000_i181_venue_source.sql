-- I-181: record where every venue came from and who created it.
--
-- Venues now come from four places: the addvenue skill (Claude, via SQL), the admin's inline
-- "Create venue" and /admin/venues/new, an organizer's event form (a name plus a street address
-- with no listed venue becomes a no-page venue automatically), and the signed-in /venues/new
-- form. `source` says which; `created_by` is the auth user when there is one (Claude's SQL
-- inserts have none, so `source` carries it). Existing rows stay NULL: unknown, not guessed.
--
-- No grant changes: since 20260910110821 anon/authenticated SELECT on venues is a column
-- whitelist, so both new columns are readable only by the service role. Every reader (admin
-- pages, the venue search, the submit actions) uses the service-role client.

alter table public.venues
  add column source text
    check (source in ('addvenue', 'admin', 'event_form', 'venue_form')),
  add column created_by uuid references auth.users (id) on delete set null;

comment on column public.venues.source is
  'Where the row came from: addvenue (Claude), admin, event_form (auto-created from an event), venue_form (/venues/new). NULL = before I-181.';
comment on column public.venues.created_by is
  'auth user who created the row, when there was one. Internal, not granted to anon/authenticated.';

-- The admin "new venues" view and the per-user daily cap on /venues/new both filter on these.
create index venues_created_by_idx on public.venues (created_by) where created_by is not null;
