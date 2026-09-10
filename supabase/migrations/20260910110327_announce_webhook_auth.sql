-- Security review 2026-09-05 (follow-up applied 2026-09-10): the three Telegram announce edge
-- functions ran with verify_jwt = false (supabase/config.toml — their caller is a database
-- webhook/trigger, not a signed-in user) and had no in-code authorization, making them public
-- endpoints. Verified live before writing this fix, with no credentials at all:
--   POST /functions/v1/announce-event            -> 200
--   POST /functions/v1/announce-event-channel     -> 200
--   POST /functions/v1/announce-event-cancelled   -> 200
-- Anyone on the internet could POST a fabricated {record: {...}} body and have the functions
-- publish arbitrary content to the official Telegram group and @citreasurelist channel as this
-- project's bot. announce-event-cancelled is the sharpest edge: it looks up a stored message_id
-- by the body-supplied event id (readable via the anon API) and calls editMessageCaption, so it
-- could rewrite the caption of real, already-published channel posts.
--
-- Fix: the functions now require Authorization: Bearer <secret>, same shape as
-- cleanup-tg-messages. This migration rewires their triggers to send that header.
-- supabase_functions.http_request (what "on-event-published-channel" and "on-event-cancelled"
-- were created with, in 20260720162042/20260720194150) takes its headers as a literal jsonb
-- argument baked into the trigger definition at CREATE TRIGGER time — there is no way to attach
-- a secret there without committing it to git. This project already solved exactly that problem
-- once, for /api/revalidate (20260721205619): call pg_net directly and read the secret from
-- Supabase Vault at call time instead. Same pattern here.
--
-- Deliberately NOT the service_role key: that credential is one of the three still pending
-- rotation from the I-169 hermes incident, and reusing it here would (a) give this webhook a
-- bearer-checkable copy of the most powerful credential in the project for a job that only needs
-- to prove "this came from our own trigger", and (b) add one more place to update whenever that
-- rotation happens. A purpose-built secret, announce_webhook_secret, is scoped to exactly this
-- job and unaffected by the pending rotation, following the same one-secret-per-purpose
-- convention as revalidate_secret.
--
-- Also added here, since the trigger functions are being rewritten anyway: an early-exit guard
-- matching each edge function's own skip condition, so pg_net (and the network round-trip it
-- costs) is only spent on the actual transition instead of on every event write. Confirmed live
-- via pg_get_triggerdef before writing this (2026-09-10): all three existing triggers, including
-- the dashboard-created on-event-published, are AFTER UPDATE ON events, never INSERT — so no
-- TG_OP branching is needed here after all; a plain OLD/NEW comparison is correct for all three.
--
-- One-time setup required outside this migration (deliberately not committed — contains the
-- secret), same two-sided pattern as revalidate_secret:
--   1. In the Supabase SQL editor:
--        select vault.create_secret('<a random value>', 'announce_webhook_secret');
--   2. Set the SAME value as an edge function secret:
--        supabase secrets set ANNOUNCE_WEBHOOK_SECRET=<the same random value> --project-ref ormttcjjsumbmvyennfx
-- Until both are done, the trigger functions no-op (see "secret is null" branch below) rather
-- than blocking the event write that fired them — announcements pause, fail-closed, same
-- contract as trigger_revalidate. Deploy order: apply this migration and deploy the three edge
-- functions (with the bearer check, see the same commit) together, then do the two steps above.
-- Applying only the migration keeps announcements working via the old unauthenticated triggers
-- until the new ones are live; deploying only the functions makes every announcement 401 until
-- the new triggers exist.

-- =============================================================================
-- Trigger functions — one per announcer, same independence as the triggers themselves.
-- =============================================================================

create or replace function public.trigger_announce_event_published()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  secret text;
begin
  -- Same skip condition as announce-event/index.ts's own guard, checked here first so an
  -- unrelated event write never costs a network call. AFTER UPDATE ON events only (confirmed
  -- live via pg_get_triggerdef, 2026-09-10) — old is always populated here.
  if old.status = 'published' or new.status is distinct from 'published' then
    return coalesce(new, old);
  end if;

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'announce_webhook_secret'
  limit 1;

  -- Not provisioned yet (e.g. a fresh branch/preview DB, or before the one-time setup above) —
  -- no-op rather than blocking the write that fired this, same convention as trigger_revalidate.
  if secret is null then
    return coalesce(new, old);
  end if;

  perform net.http_post(
    url := 'https://ormttcjjsumbmvyennfx.supabase.co/functions/v1/announce-event',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'record', to_jsonb(new),
      'old_record', to_jsonb(old)
    ),
    timeout_milliseconds := 5000
  );

  return coalesce(new, old);
end;
$$;

create or replace function public.trigger_announce_event_channel_published()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  secret text;
begin
  -- UPDATE-only trigger (confirmed by 20260720162042, its original migration) — old is always
  -- populated here.
  if old.status = 'published' or new.status is distinct from 'published' then
    return coalesce(new, old);
  end if;

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'announce_webhook_secret'
  limit 1;

  if secret is null then
    return coalesce(new, old);
  end if;

  perform net.http_post(
    url := 'https://ormttcjjsumbmvyennfx.supabase.co/functions/v1/announce-event-channel',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'record', to_jsonb(new),
      'old_record', to_jsonb(old)
    ),
    timeout_milliseconds := 5000
  );

  return coalesce(new, old);
end;
$$;

create or replace function public.trigger_announce_event_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  secret text;
begin
  -- UPDATE-only trigger (confirmed by 20260720194150, its original migration) — old is always
  -- populated here. events.cancelled is NOT NULL, so no null-handling needed.
  if old.cancelled = true or new.cancelled is distinct from true then
    return coalesce(new, old);
  end if;

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'announce_webhook_secret'
  limit 1;

  if secret is null then
    return coalesce(new, old);
  end if;

  perform net.http_post(
    url := 'https://ormttcjjsumbmvyennfx.supabase.co/functions/v1/announce-event-cancelled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'record', to_jsonb(new),
      'old_record', to_jsonb(old)
    ),
    timeout_milliseconds := 5000
  );

  return coalesce(new, old);
end;
$$;

-- =============================================================================
-- Swap the triggers. Firing spec preserved exactly as each currently has it (see the function
-- comments above for how that was determined for each).
--
-- "on-event-published" was created through the dashboard (Database Webhooks,
-- supabase_functions.http_request) and never lived in a migration; IF EXISTS keeps fresh
-- branches (supabase db reset) from failing on the drop.
-- =============================================================================

drop trigger if exists "on-event-published" on public.events;
create trigger "on-event-published"
after update on public.events
for each row execute function public.trigger_announce_event_published();

drop trigger if exists "on-event-published-channel" on public.events;
create trigger "on-event-published-channel"
after update on public.events
for each row execute function public.trigger_announce_event_channel_published();

drop trigger if exists "on-event-cancelled" on public.events;
create trigger "on-event-cancelled"
after update on public.events
for each row execute function public.trigger_announce_event_cancelled();
