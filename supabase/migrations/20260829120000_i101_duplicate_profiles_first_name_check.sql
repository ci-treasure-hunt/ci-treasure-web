-- I-101 data-quality check: "possible duplicate profiles" was scoring on full-name trigram
-- similarity alone, which false-positives on two different people who happen to share a
-- distinctive last name -- e.g. "Miriam Wolodarski Lundberg" / "Andy Wolodarski Lundberg"
-- (co-managers of the same venue, same surname, different people, score 0.63) and
-- "Nhu Nguyen" / "Nguyen Nguyen" (score 0.7, share only the common Vietnamese surname
-- "Nguyen"). Both alerted daily with no way to resolve, since duplicate_profiles has no
-- seen-state suppression (unlike shadow_linked). Fix: also require the first-name tokens to
-- be similar, not just the full string -- a real duplicate (typo, nickname, re-entry) has a
-- similar first name too; two different people sharing a surname don't.
CREATE OR REPLACE FUNCTION public.run_data_quality_checks()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH malformed_short_id AS (
    SELECT short_id, title FROM events
    WHERE short_id IS NULL OR short_id !~ '^[a-zA-Z0-9]{4}$'
  ),
  stale_published AS (
    -- Should have been auto-archived by the daily pg_cron job (published -> archived once
    -- end_date passes) -- a hit here means that job didn't run, not a data-entry mistake.
    SELECT short_id, title, end_date FROM events
    WHERE status = 'published' AND end_date < (current_date - interval '1 day')
  ),
  duplicate_slugs AS (
    SELECT slug, count(*) AS n, array_agg(name) AS names
    FROM profiles GROUP BY slug HAVING count(*) > 1
  ),
  stale_drafts AS (
    SELECT short_id, title, updated_at FROM events
    WHERE status = 'draft' AND admin_notes LIKE 'SKELETON:%'
      AND updated_at < now() - interval '30 days'
  ),
  venue_mismatch AS (
    SELECT e.short_id, e.title, e.country AS event_country, v.country AS venue_country, v.name AS venue_name
    FROM events e JOIN venues v ON v.id = e.venue_id
    WHERE e.country IS DISTINCT FROM v.country
  ),
  orphan_events AS (
    SELECT e.short_id, e.title, e.status FROM events e
    WHERE e.status IN ('published', 'draft')
      AND NOT EXISTS (SELECT 1 FROM event_organizers eo WHERE eo.event_id = e.id)
      AND NOT EXISTS (SELECT 1 FROM event_teachers et WHERE et.event_id = e.id)
  ),
  duplicate_profiles AS (
    SELECT a.name AS name_a, b.name AS name_b, a.slug AS slug_a, b.slug AS slug_b,
           round(similarity(a.name, b.name)::numeric, 2) AS score
    FROM profiles a JOIN profiles b ON a.id < b.id
    WHERE (
      similarity(a.name, b.name) > 0.6
      AND similarity(split_part(a.name, ' ', 1), split_part(b.name, ' ', 1)) > 0.5
    )
       OR (a.name = b.name AND a.city IS NOT NULL AND a.city = b.city)
    ORDER BY score DESC NULLS LAST
  ),
  legacy_price_format AS (
    -- Old {"tiers": [...]} shape instead of the actual {"items": [{"amount","currency",
    -- "description"}]} convention -- likely renders wrong/blank on the site.
    SELECT short_id, title FROM events
    WHERE price IS NOT NULL AND price ? 'tiers'
  ),
  malformed_links AS (
    -- Double-encoded jsonb string instead of a real object -- see migration header comment.
    SELECT short_id, title FROM events
    WHERE links IS NOT NULL AND jsonb_typeof(links) IS DISTINCT FROM 'object'
  ),
  missing_image AS (
    -- Upcoming published events with no flyer/photo -- content-completeness gap, not a defect.
    SELECT short_id, title, start_date FROM events
    WHERE status = 'published' AND end_date >= current_date AND image_url IS NULL
  ),
  shadow_linked AS (
    -- Full current list; caller diffs against its own state to only alert on newly-linked ones
    -- (expected to be a large, steady-state list once I-066's CIGC import lands, not a defect).
    SELECT DISTINCT p.id, p.name FROM profiles p
    WHERE p.visibility = 'shadow'
      AND (
        EXISTS (SELECT 1 FROM event_teachers et WHERE et.teacher_id = p.id)
        OR EXISTS (SELECT 1 FROM event_organizers eo WHERE eo.organizer_id = p.id)
      )
  ),
  tz_events AS (
    -- Timezone validity/correctness needs Python (zoneinfo + timezonefinder) -- just hand over
    -- every event with coordinates so the caller can check each one.
    SELECT short_id, title, timezone, lat, lng, country FROM events
    WHERE lat IS NOT NULL AND lng IS NOT NULL
  )
  SELECT jsonb_build_object(
    'malformed_short_id', (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (SELECT * FROM malformed_short_id LIMIT 10) t),
    'malformed_short_id_total', (SELECT count(*) FROM malformed_short_id),
    'stale_published', (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (SELECT * FROM stale_published LIMIT 10) t),
    'stale_published_total', (SELECT count(*) FROM stale_published),
    'duplicate_slugs', (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (SELECT * FROM duplicate_slugs LIMIT 10) t),
    'duplicate_slugs_total', (SELECT count(*) FROM duplicate_slugs),
    'stalled_messages_count', (SELECT count(*) FROM raw_messages WHERE processed = false AND created_at < now() - interval '7 days'),
    'stale_drafts', (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (SELECT * FROM stale_drafts LIMIT 10) t),
    'stale_drafts_total', (SELECT count(*) FROM stale_drafts),
    'venue_mismatch', (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (SELECT * FROM venue_mismatch LIMIT 10) t),
    'venue_mismatch_total', (SELECT count(*) FROM venue_mismatch),
    'orphan_events', (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (SELECT * FROM orphan_events LIMIT 10) t),
    'orphan_events_total', (SELECT count(*) FROM orphan_events),
    'duplicate_profiles', (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (SELECT * FROM duplicate_profiles LIMIT 10) t),
    'duplicate_profiles_total', (SELECT count(*) FROM duplicate_profiles),
    'legacy_price_format', (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (SELECT * FROM legacy_price_format LIMIT 10) t),
    'legacy_price_format_total', (SELECT count(*) FROM legacy_price_format),
    'malformed_links', (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (SELECT * FROM malformed_links LIMIT 10) t),
    'malformed_links_total', (SELECT count(*) FROM malformed_links),
    'missing_image', (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (SELECT * FROM missing_image ORDER BY start_date LIMIT 10) t),
    'missing_image_total', (SELECT count(*) FROM missing_image),
    'shadow_linked', (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM shadow_linked t),
    'tz_events', (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM tz_events t)
  );
$$;

REVOKE ALL ON FUNCTION public.run_data_quality_checks() FROM public;
GRANT EXECUTE ON FUNCTION public.run_data_quality_checks() TO service_role;
