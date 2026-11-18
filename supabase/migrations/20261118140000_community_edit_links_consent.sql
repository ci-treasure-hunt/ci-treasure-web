-- "Suggest an edit" on a community page: the submitter of a new group/chat link can confirm that
-- they are an admin of the group, or that an admin agreed, so the admin knows the link may be
-- published (same consent the Add form asks for via communities.links_consent). Playa del Carmen,
-- 2026-11-18: a group admin sent a replacement WhatsApp link and we had no way to tell.
alter table public.community_edit_suggestions
  add column links_consent boolean not null default false;

comment on column public.community_edit_suggestions.links_consent is
  'Submitter ticked: admin of the group (or an admin agreed), OK to show the link on the listing. Only set when the "Group or chat link" field was ticked.';
