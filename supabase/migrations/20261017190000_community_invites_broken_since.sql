-- I-029: an invite link that stopped working (revoked or reset by the group). Kept, not deleted, so
-- the community stays listed and readers can send the new link: the website and Steve's Telegram
-- lists hide the dead link and ask for a new one instead. Set by the weekly link check or the admin
-- form; cleared when a new URL is saved or a later check finds the link working again.
alter table public.community_invites add column broken_since timestamptz;
