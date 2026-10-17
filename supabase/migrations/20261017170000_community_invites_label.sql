-- I-029: the group's own name, for Steve's Telegram chat lists ("CI & Somatik Bonn" and
-- "Contact Impro Bonn Infos" are two groups of the same community). Null = use the community name.
-- No grant needed: community_invites has no anon/authenticated access by design.
alter table public.community_invites add column label text;
