-- I-029: list sync every 6 hours instead of hourly (Jan, 2026-10-17). New communities no longer wait
-- for it: announce-community calls the sync right after its announcement. The 6-hourly run covers
-- edits to listed communities and the 06:00 link check (06:15 run).
select cron.unschedule('sync-community-lists-hourly');
select cron.schedule(
  'sync-community-lists-6h',
  '15 */6 * * *',
  $$
    select net.http_post(
      url := 'https://ormttcjjsumbmvyennfx.supabase.co/functions/v1/sync-community-lists',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'announce_webhook_secret')
      ),
      body := '{"target":"live"}'::jsonb,
      timeout_milliseconds := 140000
    );
  $$
);
