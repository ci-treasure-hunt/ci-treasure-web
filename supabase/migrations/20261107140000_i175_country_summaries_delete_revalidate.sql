-- I-175 step 5: deleting a country summary (taking a country page offline) fires the revalidate
-- webhook too. Every page now reads the cached list of countries with a page (the root layout's
-- country band, the detail pages' country link) and keeps it for up to 7 days, so a missed DELETE
-- would leave links to a removed page for a week. The trigger was insert/update only.
-- The route invalidates that list on INSERT and DELETE only; a prose UPDATE refreshes just the
-- country page itself.

drop trigger if exists on_country_summaries_write_revalidate on public.country_summaries;
create trigger on_country_summaries_write_revalidate
after insert or update or delete on public.country_summaries
for each row execute function public.trigger_revalidate();
