-- I-175 step 3: the revalidate webhook (app/api/revalidate/route.ts) learns about every write that
-- changes a public page, so the detail pages can later be cached for days instead of rendered on
-- every request. Spec: ci-treasure-hunt/docs/issues/i-175-entity-page-caching.md.
--
-- Three changes, all reusing public.trigger_revalidate() from 20260721205619 (same vault secret,
-- payload carries tg_op, the table name, and the new and old row):
--
-- 1. Link tables fire the webhook. Adding a teacher to an event changed that teacher's page and
--    nothing refreshed it. DELETE too: a removed link must refresh the page it was removed from,
--    and the route reads old_record for that.
--
-- 2. The four entity triggers also fire on DELETE (they were insert/update only), and an UPDATE
--    fires only when a column other than pure bookkeeping changed. Each event write now fans out
--    to the pages of everyone credited on it, so a save that only bumps updated_at or edits
--    admin_notes should not re-render them. The excluded list is deliberately short: a column
--    wrongly excluded leaves a page stale, one wrongly included only costs a refresh.
--
-- 3. The invite tables call the webhook directly instead of touching the parent's updated_at
--    (20261023140000_invites_touch_parent.sql): that touch is exactly what the WHEN clause in (2)
--    ignores. The route looks up the parent's slug itself.

-- (2) entity tables. A WHEN clause that reads OLD cannot sit on an INSERT trigger, hence two
-- triggers per table.
drop trigger if exists on_events_write_revalidate on public.events;
create trigger on_events_write_revalidate
after insert or delete on public.events
for each row execute function public.trigger_revalidate();
create trigger on_events_update_revalidate
after update on public.events
for each row
when ((to_jsonb(old) - array['updated_at', 'updated_by', 'imported_by', 'admin_notes'])
      is distinct from (to_jsonb(new) - array['updated_at', 'updated_by', 'imported_by', 'admin_notes']))
execute function public.trigger_revalidate();

drop trigger if exists on_profiles_write_revalidate on public.profiles;
create trigger on_profiles_write_revalidate
after insert or delete on public.profiles
for each row execute function public.trigger_revalidate();
create trigger on_profiles_update_revalidate
after update on public.profiles
for each row
when ((to_jsonb(old) - array['updated_at', 'claim_pending_user_id'])
      is distinct from (to_jsonb(new) - array['updated_at', 'claim_pending_user_id']))
execute function public.trigger_revalidate();

drop trigger if exists on_venues_write_revalidate on public.venues;
create trigger on_venues_write_revalidate
after insert or delete on public.venues
for each row execute function public.trigger_revalidate();
create trigger on_venues_update_revalidate
after update on public.venues
for each row
when ((to_jsonb(old) - array['updated_at', 'admin_notes'])
      is distinct from (to_jsonb(new) - array['updated_at', 'admin_notes']))
execute function public.trigger_revalidate();

drop trigger if exists on_communities_write_revalidate on public.communities;
create trigger on_communities_write_revalidate
after insert or delete on public.communities
for each row execute function public.trigger_revalidate();
create trigger on_communities_update_revalidate
after update on public.communities
for each row
when ((to_jsonb(old) - array['updated_at', 'admin_notes', 'synced_at', 'airtable_updated_at'])
      is distinct from (to_jsonb(new) - array['updated_at', 'admin_notes', 'synced_at', 'airtable_updated_at']))
execute function public.trigger_revalidate();

-- (1) link tables.
create trigger on_event_teachers_write_revalidate
after insert or update or delete on public.event_teachers
for each row execute function public.trigger_revalidate();

create trigger on_event_organizers_write_revalidate
after insert or update or delete on public.event_organizers
for each row execute function public.trigger_revalidate();

create trigger on_community_profiles_write_revalidate
after insert or update or delete on public.community_profiles
for each row execute function public.trigger_revalidate();

create trigger on_community_venues_write_revalidate
after insert or update or delete on public.community_venues
for each row execute function public.trigger_revalidate();

create trigger on_venue_profiles_write_revalidate
after insert or update or delete on public.venue_profiles
for each row execute function public.trigger_revalidate();

-- (3) invite tables: own webhook instead of the parent touch.
drop trigger if exists profile_invites_touch_parent on public.profile_invites;
drop trigger if exists venue_invites_touch_parent on public.venue_invites;
drop function if exists public.touch_invite_parent();

create trigger on_profile_invites_write_revalidate
after insert or update or delete on public.profile_invites
for each row execute function public.trigger_revalidate();

create trigger on_venue_invites_write_revalidate
after insert or update or delete on public.venue_invites
for each row execute function public.trigger_revalidate();
