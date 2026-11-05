-- I-175 step 4: community group invites fire the revalidate webhook, now that community pages are
-- cached. The page shows a "Join" button per published, working invite and a "link expired" note per
-- broken one (lib/communities.ts getPublishedInvitePlatforms / getExpiredInvitePlatforms), and
-- community_invites had no trigger: publishing an invite (admin SQL, see the community-invites
-- workflow) or the daily check-invite-links job marking one broken would not have reached the
-- cached page for a day. The route handles the table by refreshing the parent community's page.
--
-- UPDATEs that only touch synced_at (bookkeeping) do not fire; check-invite-links writes
-- broken_since only when a link's state changes.

create trigger on_community_invites_write_revalidate
after insert or delete on public.community_invites
for each row execute function public.trigger_revalidate();

create trigger on_community_invites_update_revalidate
after update on public.community_invites
for each row
when ((to_jsonb(old) - array['synced_at']) is distinct from (to_jsonb(new) - array['synced_at']))
execute function public.trigger_revalidate();
