-- Refresh the cached profile/venue page when its gated group invites change.
--
-- The teacher and venue pages are ISR-cached for 24h and refreshed on write by the revalidate
-- webhook on `profiles` / `venues` (20260721205619_revalidate_on_write.sql). profile_invites
-- (20261023120000) and venue_invites (20261016140000) had no such hook, so an invite added
-- directly in the database (admin SQL/MCP) only appeared on the page up to a day later; found
-- 2026-10-23 on Richard Parker's WhatsApp group. The owner's dashboard save was unaffected (its
-- server action calls revalidatePath itself).
--
-- Rather than teaching /api/revalidate a new payload shape (an invite row carries the parent id,
-- not the slug the route needs), a write to an invite touches the parent's updated_at, which fires
-- the parent's existing webhook. Only updated_at changes, so protect_profile_privileged_columns has
-- nothing to revert. On a parent delete the cascade's touch matches no row and does nothing.

create or replace function public.touch_invite_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'profile_invites' then
    update public.profiles set updated_at = now() where id = coalesce(new.profile_id, old.profile_id);
  elsif tg_table_name = 'venue_invites' then
    update public.venues set updated_at = now() where id = coalesce(new.venue_id, old.venue_id);
  end if;
  return null;
end;
$$;

revoke all on function public.touch_invite_parent() from public, anon, authenticated;

-- Statement-level would fire once per save, but it can't see which parent changed; the owner's
-- save is delete-all + insert, so per-row costs at most a handful of webhooks per save.
create trigger profile_invites_touch_parent
after insert or update or delete on public.profile_invites
for each row execute function public.touch_invite_parent();

create trigger venue_invites_touch_parent
after insert or update or delete on public.venue_invites
for each row execute function public.touch_invite_parent();
