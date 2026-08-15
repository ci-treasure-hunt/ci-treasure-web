-- country_summaries.updated_at only ever got its DEFAULT now() on INSERT: the table was created
-- without the update_updated_at_column() trigger that events, profiles, venues, event_series and
-- import_jobs all carry. The country page renders that column as "Last updated", so every edit to
-- an existing summary left the page advertising its original publication date instead. Caught
-- 2026-08-15 while editing the Spain summary in place.
--
-- Only the revalidation trigger (on_country_summaries_write_revalidate, AFTER INSERT OR UPDATE)
-- existed here, which is why edits still reached the site promptly while showing a stale date.

CREATE TRIGGER trg_country_summaries_updated_at
  BEFORE UPDATE ON public.country_summaries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
