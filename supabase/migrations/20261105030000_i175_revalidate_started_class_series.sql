-- I-175 (prerequisite for step 5): refresh the cached pages of a class series once its first session
-- has passed. That is the one date-driven change on the cached detail pages with no database write
-- behind it: from the day after start_date (UTC) a class series shows "booking closed" on its own page
-- (components/event-detail-view.tsx, classSeriesStarted) and drops out of the upcoming lists on its
-- teachers', venue's and communities' pages and the community "upcoming events in this country" box
-- (lib/event-display.ts isUpcomingListing / upcomingClassSeriesFilter). Normal events need nothing
-- like this: the nightly archive-past-events job changes their status, which fires the trigger.
--
-- The job sends each such event to the revalidate webhook as an events UPDATE with old_record null.
-- The route then refreshes everything an event write can touch, including the country box (it
-- treats a missing old_record like a new event). Same vault secret and payload shape as
-- public.trigger_revalidate(). A class series is type 'class' with start_date < end_date
-- (isClassSeries); about one a month in Nov 2026, so the job is cheap.
--
-- p_day defaults to yesterday, so a manual call can replay one day: select
-- public.revalidate_started_class_series('2026-10-16');

create or replace function public.revalidate_started_class_series(p_day date default current_date - 1)
returns integer
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  secret text;
  ev record;
  sent integer := 0;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'revalidate_secret'
  limit 1;

  if secret is null then
    return 0;
  end if;

  for ev in
    select e.*
    from public.events e
    where e.type = 'class'
      and e.status = 'published'
      and e.start_date < e.end_date
      and e.start_date = p_day
  loop
    perform net.http_post(
      url := 'https://citreasurehunt.com/api/revalidate',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || secret
      ),
      body := jsonb_build_object(
        'type', 'UPDATE',
        'table', 'events',
        'record', to_jsonb(ev),
        'old_record', null
      ),
      timeout_milliseconds := 5000
    );
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke all on function public.revalidate_started_class_series(date) from public, anon, authenticated;

-- 00:10 UTC: the site computes "today" in UTC, so a series that started yesterday shows as started
-- from 00:00 UTC; ten minutes later its pages are refreshed.
select cron.schedule(
  'revalidate-started-class-series',
  '10 0 * * *',
  $$select public.revalidate_started_class_series()$$
);
