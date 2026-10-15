-- I-029 stage 3: Steve maintains the Telegram community and chat lists.
--
-- 1. communities.other_resource_label: a name for the one "other" link, so it reads "Matrix",
--    "Hipsy", "Spreadsheet" or "Planning tool" instead of a generic "Other Resource", on the
--    website and in the Telegram lists alike. Public like other_resource itself. communities uses
--    column-level grants since I-111, so a new public column needs its own grant.
--
-- 2. tg_list_messages: which Telegram message holds which list, and the text Steve last posted
--    there. The weekly sync renders every list, compares with posted_text, and calls
--    editMessageText only for the ones that changed. A bot can only edit its own messages, which
--    is why the lists are reposted by Steve once and then kept (their t.me links stay valid).
--    Service role only: no anon/authenticated access, RLS on with no policies.

alter table public.communities add column if not exists other_resource_label text;
grant select (other_resource_label) on public.communities to anon, authenticated;

create table if not exists public.tg_list_messages (
  list_key    text        not null,
  part        int         not null default 1,
  chat_id     bigint      not null,
  thread_id   bigint      not null,
  message_id  bigint      not null,
  posted_text text        not null,
  link_count  int         not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (list_key, part, chat_id)
);

alter table public.tg_list_messages enable row level security;
revoke all on public.tg_list_messages from anon, authenticated;
