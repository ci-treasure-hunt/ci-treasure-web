-- I-029: Steve keeps the public Telegram community and chat lists current (sync-community-lists).
-- Hourly at :15; a run with no changes edits nothing and posts nothing. Same pattern as the link
-- check: pg_net call with the bearer secret read from Vault at run time.
select cron.schedule(
  'sync-community-lists-hourly',
  '15 * * * *',
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
