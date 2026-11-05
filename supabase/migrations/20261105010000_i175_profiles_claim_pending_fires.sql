-- I-175 step 4: a profile UPDATE that only changes claim_pending_user_id must fire the revalidate
-- webhook. 20261023210000_i175_link_table_revalidate.sql listed that column as bookkeeping, but the
-- teacher page renders it: "Claim pending review" in place of the "This is me" button
-- (app/teachers/[slug]/page.tsx, ClaimCta). Harmless while the page rendered per request; now that
-- it is cached, skipping the write would leave the claim button up for a day after a claim.

drop trigger if exists on_profiles_update_revalidate on public.profiles;
create trigger on_profiles_update_revalidate
after update on public.profiles
for each row
when ((to_jsonb(old) - array['updated_at']) is distinct from (to_jsonb(new) - array['updated_at']))
execute function public.trigger_revalidate();
