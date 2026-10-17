-- I-029: announce-community now also runs the list sync before it answers, which can take longer than
-- the old 5 s. pg_net sends in the background, so a longer timeout never holds up the save. Same
-- function as 20261015130000 otherwise.

create or replace function public.trigger_announce_community_published()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  secret text;
begin
  if new.status is distinct from 'published' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'announce_webhook_secret'
  limit 1;

  if secret is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://ormttcjjsumbmvyennfx.supabase.co/functions/v1/announce-community',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'record', to_jsonb(new),
      'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
    ),
    timeout_milliseconds := 120000
  );

  return new;
end;
$$;
