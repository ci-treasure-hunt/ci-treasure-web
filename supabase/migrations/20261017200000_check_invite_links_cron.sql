-- I-029: link check of all WhatsApp/Telegram links (supabase/functions/check-invite-links). Daily at
-- 06:00 UTC, one seventh of the links each day (WhatsApp throttles bursts), so every link is checked
-- weekly; the next hourly list sync shows the result. Same pattern as the announce
-- triggers: pg_net call with the bearer secret read from Vault at run time, never stored here.
select cron.schedule(
  'check-invite-links-daily',
  '0 6 * * *',
  $$
    select net.http_post(
      url := 'https://ormttcjjsumbmvyennfx.supabase.co/functions/v1/check-invite-links',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'announce_webhook_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 145000
    );
  $$
);
