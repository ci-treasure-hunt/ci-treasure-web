-- Security review 2026-09-05: the three Telegram announce edge functions ran with
-- verify_jwt = false (supabase/config.toml — their caller is a database webhook, not a signed-in
-- user) and had no in-code authorization, making them public endpoints. Anyone on the internet
-- could POST a fabricated {record: {...}} body and have service-role code publish arbitrary
-- content to the official Telegram group/@citreasurelist channel as this project's bot, and
-- announce-event-cancelled could rewrite the caption of real channel posts. The functions now
-- require Authorization: Bearer <service-role key>, mirroring cleanup-tg-messages.
--
-- This migration rewires their triggers to send that header. supabase_functions.http_request
-- cannot attach an Authorization header from a migration without committing the secret to git,
-- so — exactly like trigger_revalidate (20260721205619) — the triggers call pg_net directly and
-- read the secret from Vault at call time. Hosted Supabase projects provision a reserved Vault
-- secret named service_role_key automatically; if it is absent (local/self-hosted or an older
-- project), the triggers no-op (announcements pause, fail-closed) until it is created:
--   select vault.create_secret('<service-role key>', 'service_role_key');
-- (No committed value either way — the key is read from Vault at call time only.)
--
-- The payload shape replicates supabase_functions.http_request's webhook body
-- ({type, table, record, old_record}), which is what the functions' existing
-- `const { record: event, old_record } = await req.json()` destructuring expects.
--
-- Deploy order matters: deploy the three edge functions (with the bearer check) and apply this
-- migration together, as one release. Applying the migration alone keeps announcements working
-- (old triggers still fire until replaced); deploying the functions alone makes every
-- announcement 401 until the new triggers are live.
--
-- One-time setup required outside this migration: none on hosted projects that carry the
-- reserved service_role_key Vault secret (see above); one vault.create_secret call otherwise.

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
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  -- Not provisioned (e.g. a fresh branch/preview DB) — no-op rather than blocking the write
  -- that fired this, same convention as trigger_revalidate.
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
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'service_role_key'
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
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'service_role_key'
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
-- Swap the triggers. "on-event-published" was created through the dashboard (Database
-- Webhooks, supabase_functions.http_request) and never lived in a migration; IF EXISTS
-- keeps fresh branches (supabase db reset) from failing on the drop.
-- =============================================================================

drop trigger if exists "on-event-published" on public.events;
create trigger "on-event-published"
after insert or update on public.events
for each row execute function public.trigger_announce_event_published();

drop trigger if exists "on-event-published-channel" on public.events;
create trigger "on-event-published-channel"
after update on public.events
for each row execute function public.trigger_announce_event_channel_published();

drop trigger if exists "on-event-cancelled" on public.events;
create trigger "on-event-cancelled"
after update on public.events
for each row execute function public.trigger_announce_event_cancelled();
