-- I-171 Stage 5, DEC-3b (2026-11-12): open-ended recurring series renew on confirmation.
--
-- An organizer can now pick "keeps going, no end date" for a weekly/biweekly event. The form
-- creates dates about six months ahead and stores the pattern in event_series.recurrence_rule
-- ("FREQ=WEEKLY;INTERVAL=1" or "...=2"). Nothing extends a series automatically: about four weeks
-- and again one week before its last date, the owner gets an email ("Still running? Extend 6
-- months"). No confirmation, and the dates simply run out; the nightly archive job ends the listing
-- like any one-off event. Spec: ci-treasure-hunt/docs/issues/i-171-recurring-jams-classes.md.
--
-- The renewal state lives in its own deny-all table, not on event_series: event_series is publicly
-- readable (policy event_series_select_public), and the token in the email link must not be.
--   token           random token in the link (/series/renew/<token>). Set when a reminder goes
--                   out, cleared when the series is extended, so a used link stops working.
--   reminder_count  reminders sent for the current last date (0, 1 or 2); reset on extend.
--   reminded_at     when the last one went out.
--   last_date       the series' last date that the reminders were about; a new last date (dates
--                   added by hand) resets the count.
-- Service role only (edge function series-renewal-reminders, lib/series-renewal.ts).

create table if not exists public.event_series_renewals (
  series_id uuid primary key references public.event_series (id) on delete cascade,
  token uuid unique,
  reminder_count smallint not null default 0,
  reminded_at timestamptz,
  last_date date,
  updated_at timestamptz not null default now()
);

alter table public.event_series_renewals enable row level security;
revoke all on public.event_series_renewals from anon, authenticated;

comment on table public.event_series_renewals is
  'I-171 DEC-3b: renewal reminder state per open-ended series. Deny-all (RLS, no policies), service role only.';

comment on column public.event_series.recurrence_rule is
  'RRULE for an open-ended series (organizer picked "keeps going"), e.g. FREQ=WEEKLY;INTERVAL=1. Used to generate the next six months on renewal (I-171 DEC-3b). NULL for finite series.';

-- Daily at 07:00 UTC, after the archive job (02:00). Same bearer-secret pattern as
-- check-invite-links: the secret is read from Vault at run time, never stored here.
select cron.schedule(
  'series-renewal-reminders-daily',
  '0 7 * * *',
  $$
    select net.http_post(
      url := 'https://ormttcjjsumbmvyennfx.supabase.co/functions/v1/series-renewal-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'announce_webhook_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $$
);
