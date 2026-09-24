-- I-111 Stage 3a: community photos, uploaded by the public and moderated (Jan, 2026-09-23:
-- "I cannot add images manually for 300 communities").
--
-- 1. communities.image_url / image_credit, the live photo. Public, so granted to anon like the
--    other public columns (20260923090000 replaced the table grant with a column whitelist, so a
--    new column is invisible until granted here).
-- 2. community_photo_submissions, the moderation queue. Anonymous uploads never touch the live
--    photo: they wait here, and only an admin approval copies one onto the community. (Profiles use
--    image_status on the row itself, which works because only the owner uploads; here anyone can,
--    and a bad upload must not knock out a good approved photo.) Service role only, same as
--    community_edit_suggestions: the uploader's contact and IP hash are in it.
-- 3. The community-images bucket. Public read, like venue-images; no storage.objects policies, so
--    only the service role writes (all uploads are server-side, after resizing).

alter table public.communities
  add column image_url text,
  add column image_credit text;

grant select (image_url, image_credit) on public.communities to anon, authenticated;

create table public.community_photo_submissions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  image_url text not null,
  image_credit text,
  contact text,
  ip_hash text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index community_photo_submissions_status_created_idx
  on public.community_photo_submissions (status, created_at);

alter table public.community_photo_submissions enable row level security;

revoke all on public.community_photo_submissions from anon, authenticated;

-- Same limits as the other entity buckets (8MB, JPEG + WebP: large is JPEG, medium/small WebP).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-images', 'community-images', true, 8388608, array['image/jpeg', 'image/webp']);

-- Rollback:
--   delete from storage.buckets where id = 'community-images';  (after emptying it)
--   drop table public.community_photo_submissions;
--   alter table public.communities drop column image_url, drop column image_credit;
