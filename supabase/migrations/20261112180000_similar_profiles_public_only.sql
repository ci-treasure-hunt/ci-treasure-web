-- Hidden profiles are no longer findable by other users (2026-11-12).
--
-- search_similar_profiles is SECURITY DEFINER and granted to every authenticated user, so any
-- signed-in account could look up shadow profiles by name and read a 160-character bio snippet,
-- through the new-profile and event-form duplicate warnings or by calling the RPC directly. A
-- teacher who signed up was shown a hidden profile built from his CI Global Calendar entry that
-- he had never been told about. Shadow means hidden from everyone except admins; a deliberate
-- invitation goes through the /dashboard/claim?profile=<id> deep link instead.
--
-- Trade-off accepted: the duplicate warning no longer catches a shadow twin. New and suggested
-- profiles go through admin approval, which catches those.
--
-- Same signature and return type, so callers and grants are unchanged.
create or replace function public.search_similar_profiles(p_name text)
returns table (
  id uuid,
  name text,
  slug text,
  bio_snippet text,
  visibility profile_visibility
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.name, p.slug, left(p.bio, 160) as bio_snippet, p.visibility
  from profiles p
  where p.visibility = 'public'
    and similarity(p.name, p_name) > 0.4
  order by similarity(p.name, p_name) desc
  limit 5;
$$;
