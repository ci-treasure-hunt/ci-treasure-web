-- I-029 stage 1: announce a community in the Telegram group when it goes live.
--
-- Same shape as the event announcers (20260910110327): pg_net calls the announce-community edge
-- function with the Vault-stored announce_webhook_secret, and no-ops if the secret isn't
-- provisioned. Fires on the first transition to 'published':
--   UPDATE pending -> published  (approval in /admin/communities/pending)
--   INSERT as published          (the admin form can create a community live directly)
-- Edits to an already-published community never fire.

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
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists "on-community-published" on public.communities;
create trigger "on-community-published"
after insert or update on public.communities
for each row execute function public.trigger_announce_community_published();
