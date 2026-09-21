-- I-176: stop generate_short_id() minting IDs that collide when case is folded.
--
-- The loop checked `WHERE short_id = result`, which matches the column's own UNIQUE constraint
-- (events_short_id_key, case-sensitive btree) and is therefore correct about storage. It is not
-- enough for URLs. base62 means "CIbs" and "CIBs" are two valid, distinct IDs, and on 2026-08-28
-- the generator minted the second while the first already existed:
--
--   CIbs  Campamento CImbiosis
--   CIBs  CI Basics with Adrian Russi, Bern (September edition)
--
-- getEventBySlug resolved with .ilike(...).maybeSingle(), so both matched, maybeSingle() errored
-- on two rows, and BOTH event pages 404ed for three and a half weeks, the Adrian Russi one while
-- still linked from the homepage and /workshops. The read side is already fixed in application
-- code (ci-treasure-web c665d52: exact match first, case-insensitive only when unambiguous).
-- This closes the source so the situation cannot recur.
--
-- Scope, deliberately narrow:
--   * Only the auto-generated path changes. An explicitly supplied short_id still returns early
--     unchecked, which is how enrichment scripts import known IDs; events_short_id_key still
--     rejects an exact duplicate there, and a case-only variant stays possible by hand. That is
--     a conscious trade: the scripts are ours and reviewed, the trigger is what runs unattended.
--   * No unique index on lower(short_id), tempting though it is. The CIbs/CIBs pair is still in
--     the table, so adding one would fail unless an existing event's short_id changed, and that
--     would break a live URL to fix a problem the read-side change already neutralised.
--
-- Also pins search_path while the function is being replaced anyway: the Supabase linter flags
-- public.generate_short_id under function_search_path_mutable, and the body already fully
-- qualifies public.events, so nothing else has to change. Same treatment as
-- 20260831140000_i166_pin_is_event_organizer_search_path.sql.

CREATE OR REPLACE FUNCTION public.generate_short_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
    chars  text    := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    result text;
    done   boolean := false;
BEGIN
    -- Skip if short_id already set (e.g. during imports with known IDs)
    IF NEW.short_id IS NOT NULL THEN
        RETURN NEW;
    END IF;
    WHILE NOT done LOOP
        result := '';
        FOR i IN 1..4 LOOP
            result := result || substr(chars, floor(random() * 62 + 1)::int, 1);
        END LOOP;
        -- lower() on both sides: the column is case-sensitive, the URL space is not.
        done := NOT EXISTS (SELECT 1 FROM public.events WHERE lower(short_id) = lower(result));
    END LOOP;
    NEW.short_id := result;
    RETURN NEW;
END;
$function$;
