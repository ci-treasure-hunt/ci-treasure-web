-- I-141 Stage A: usage log for the public MCP server (app/api/mcp, lib/mcp/tools.ts).
-- One row per tool call, written by the server with the service role after the response is
-- sent. Records what was asked, never who asked: no IP, no user agent, no account. `client` is a
-- coarse platform label ("claude", "grok", "glama", ...) derived server-side, not a raw header.
-- `params` holds the tool's filters (country, dates, type, practice, free text truncated to 100
-- characters); that is what makes zero-result searches visible as data gaps.

create table public.mcp_calls (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  tool          text not null,
  client        text,
  params        jsonb not null default '{}'::jsonb,
  result_count  integer,
  duration_ms   integer,
  is_error      boolean not null default false
);

create index on public.mcp_calls (created_at);

alter table public.mcp_calls enable row level security;
-- Intentionally no policies — service role bypasses RLS, anon/authenticated get zero access.

-- Retention: individual calls are kept 12 months. Monthly totals live on in METRICS-REPORT.md.
select cron.schedule(
  'purge-mcp-calls',
  '30 3 * * *',
  $$ delete from public.mcp_calls where created_at < now() - interval '12 months'; $$
);
