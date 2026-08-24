-- Closes the gap noted in 20260721205619_revalidate_on_write.sql: communities is now
-- Supabase-authoritative (I-111 shipped; lib/communities.ts reads from the `communities` table),
-- but no trigger was ever added here, so writes to communities never busted the 3600s ISR cache
-- on /communities and /communities/[slug]. Discovered 2026-08-24 when a Supabase outage/recovery
-- left /communities stuck showing a stale "0 communities" page with no write to trigger a refresh
-- (venues/events/profiles recovered on their own writes; communities had no equivalent).
--
-- Mirrors the existing venues/events/profiles triggers exactly. Requires the same
-- 'revalidate_secret' vault secret already used by those triggers (no new setup needed) and the
-- new "communities" case added to app/api/revalidate/route.ts in the same change.

drop trigger if exists on_communities_write_revalidate on public.communities;
create trigger on_communities_write_revalidate
after insert or update on public.communities
for each row execute function public.trigger_revalidate();
