-- =============================================================================
-- CI Treasure Hunt — Database Schema
-- PostgreSQL / Supabase
-- Last updated: 2026-06-25
--
-- Decisions reference: decisions.md (ci-treasure-hunt repo)
--
-- Execution order matters. Run top to bottom.
-- Prerequisites: Supabase project with auth.users managed by Supabase Auth.
-- =============================================================================


-- =============================================================================
-- EXTENSIONS
-- =============================================================================

-- Trigram search: city names, teacher names, partial matches → D-01
-- Confirm enabled in Supabase dashboard: Database → Extensions → pg_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- pg_cron: scheduled jobs (auto-archive past events)
-- Confirm enabled in Supabase dashboard: Database → Extensions → pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;


-- =============================================================================
-- ENUMS
-- =============================================================================

-- App-level user roles. Regular authenticated users have no row in user_roles.
-- → D-12
CREATE TYPE app_role AS ENUM (
    'admin',        -- full access, user management, hard delete
    'moderator',    -- approve/reject/hide events, cannot delete
    'editor'        -- site-wide content editor (community manager)
);

-- Event lifecycle status. → D-07
CREATE TYPE event_status AS ENUM (
    'draft',        -- work in progress, not submitted
    'pending',      -- submitted, awaiting approval
    'published',    -- visible to public
    'archived'      -- past or manually retired
);

-- Event type. ENUM for typo protection on filter-critical field. → D-14
-- To add a new type: ALTER TYPE event_type ADD VALUE 'new_type';
CREATE TYPE event_type AS ENUM (
    'jam',          -- evening jam, 2-3h, open, drop-in
    'long_jam',     -- half-day to multi-day jam, minimal structure, more dancing than teaching
    'workshop',     -- 1-2 days, teaching-focused
    'training',     -- multi-part sequential series, each part builds on previous
    'festival',     -- multi-day, structured program, multiple teachers, larger group
    'retreat',      -- small group (<25), intimate, residential, mix of dance + practice
    'camp',         -- residential multi-day, less structured than festival
    'intensive',    -- multi-day skill focus, smaller group than festival
    'residency',    -- extended stay, deep-dive format
    'class',        -- regular weekly/monthly ongoing class
    'lab',          -- experimental, research-oriented, small group
    'underscore',   -- specific CI format with Authentic Movement influence
    'cdp',          -- Contemplative Dance Practice (distinct aesthetic from CI jam)
    'performance',  -- showing / performance event
    'lecture',      -- talk, film screening, panel discussion
    'other'
);

-- Series type. Two values, ENUM for consistency. → D-02, D-14
CREATE TYPE series_type AS ENUM (
    'recurring',    -- weekly jam, instances interchangeable, template-driven
    'sequential'    -- workshop training or festival arc, order matters
);

-- Profile visibility. Shadow import flow for bulk and manual imports.
CREATE TYPE profile_visibility AS ENUM (
    'shadow',       -- imported, not public, not yet claimed
    'claimed',      -- user linked their account, not yet fully public
    'public',       -- fully visible in teacher/organizer directory
    'suspended'     -- admin action, hidden from public
);

-- Venue visibility. Controls whether a venue has a public detail page. → D-05
-- Extensible: 'shadow' and 'claimed' values support a future venue claim flow.
CREATE TYPE venue_visibility AS ENUM (
    'hidden',       -- one-off rental space; no public venue page
    'public'        -- named recurring space; detail page at /venues/[slug]
);

-- Roles in event_teachers junction table.
-- Musicians are listed here too — same junction structure as teachers.
CREATE TYPE teacher_role AS ENUM (
    'teacher',
    'assistant',
    'guest',
    'musician'      -- live musician performing at the event
);

-- Roles in event_organizers junction table.
CREATE TYPE organizer_role AS ENUM (
    'lead',
    'co-organizer',
    'hosting_venue'
);


-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Role check. Used throughout RLS policies. → D-12
-- SECURITY DEFINER: runs as function owner, bypasses caller's RLS on user_roles.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
    );
$$;

-- updated_at maintenance. Applied via trigger to all tables with updated_at.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- short_id generator for events. → D-16
-- 4-char alphanumeric [0-9A-Za-z] = 62^4 = 14,776,336 combinations.
-- Loops on collision (extremely rare at CI scale, but handled gracefully).
CREATE OR REPLACE FUNCTION public.generate_short_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
        done := NOT EXISTS (SELECT 1 FROM public.events WHERE short_id = result);
    END LOOP;
    NEW.short_id := result;
    RETURN NEW;
END;
$$;


-- =============================================================================
-- TABLE: user_roles
-- Elevated roles only. Regular users have no row here. → D-12
-- =============================================================================

CREATE TABLE public.user_roles (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role        app_role NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),

    UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_select_admin" ON public.user_roles
    FOR SELECT USING (
        auth.uid() = user_id
        OR public.has_role(auth.uid(), 'admin')
    );

CREATE POLICY "user_roles_manage_admin" ON public.user_roles
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));


-- =============================================================================
-- TABLE: profiles
-- Unified table for teachers, organizers, musicians, or any combination.
-- → D-03, D-13, D-18
-- =============================================================================

CREATE TABLE public.profiles (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    -- null = imported profile without Supabase account

    -- Identity
    name                    text NOT NULL,
    slug                    text NOT NULL,
    -- generated application-side to handle collisions (maria-garcia-2)
    -- unique index on lower(slug) below

    -- Role flags
    is_teacher              boolean NOT NULL DEFAULT false,
    is_organizer            boolean NOT NULL DEFAULT false,
    is_musician             boolean NOT NULL DEFAULT false,
    bio_title               text,
    -- free-text self-description: 'Movement Artist', 'Somatic Explorer'
    is_trusted              boolean NOT NULL DEFAULT false,
    -- trusted users publish events immediately without moderation → D-07
    visibility              profile_visibility NOT NULL DEFAULT 'shadow',

    -- Bio
    bio                     text,
    profile_picture_url     text,
    translations            jsonb,
    -- {"en": {"bio": "..."}, "de": {"bio": "..."}} → D-09

    -- Social links
    website                 text,
    public_email            text,
    -- public contact for teaching inquiries, distinct from auth.users.email → D-18
    facebook                text,
    instagram               text,
    youtube                 text,
    telegram                text,
    newsletter              text,
    links                   jsonb,
    -- {"items": [{"type": "...", "url": "..."}]} for long-tail platforms

    -- Directory listing flag. DEFAULT false = active curation model.
    -- Nothing appears in /teachers directory until explicitly enabled.
    show_in_list            boolean NOT NULL DEFAULT false,

    -- Location (English-normalized)
    city                    text,
    country                 text,
    -- ISO 3166-1 alpha-2: "DE", "TH", "US"

    -- CI teaching history (valuable for bulk imports)
    year_starting_practice  integer,
    year_starting_teaching  integer,
    significant_teachers    text,
    -- freetext: "Nancy Stark Smith, Danny Lepkoff"

    -- Import source tracking
    source                  text,
    -- 'import' | 'manual' | 'user'
    source_id               text,
    -- original ID in source system

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX idx_profiles_slug    ON public.profiles (lower(slug));
CREATE UNIQUE INDEX idx_profiles_user_id ON public.profiles (user_id)
    WHERE user_id IS NOT NULL;
CREATE INDEX idx_profiles_country        ON public.profiles (country);
CREATE INDEX idx_profiles_is_teacher     ON public.profiles (is_teacher)
    WHERE is_teacher = true;
CREATE INDEX idx_profiles_is_organizer   ON public.profiles (is_organizer)
    WHERE is_organizer = true;
CREATE INDEX idx_profiles_name_trgm      ON public.profiles
    USING GIN (name gin_trgm_ops);

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_public" ON public.profiles
    FOR SELECT USING (visibility = 'public' OR auth.uid() = user_id);

CREATE POLICY "profiles_insert_authenticated" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles_update_owner_or_admin" ON public.profiles
    FOR UPDATE USING (
        auth.uid() = user_id
        OR public.has_role(auth.uid(), 'admin')
    );

CREATE POLICY "profiles_delete_admin" ON public.profiles
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));


-- =============================================================================
-- TABLE: venues
-- Known recurring physical spaces. Optional FK on events. → D-05
-- =============================================================================

CREATE TABLE public.venues (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,

    name        text NOT NULL,
    slug        text NOT NULL,

    -- Location
    address     text,
    city        text NOT NULL,
    country     text NOT NULL,
    -- ISO 3166-1 alpha-2
    region      text,
    lat         double precision,
    lng         double precision,

    -- Info
    website     text,
    description text,
    image_url   text,

    -- Social links (dedicated columns for distinct UI elements)
    email       text,
    newsletter  text,
    facebook    text,
    instagram   text,
    youtube     text,
    links       jsonb,
    -- {"items": [{"type": "telegram_group|telegram_channel|facebook_group|
    --   whatsapp_group|signal_group|calendar|vimeo|linktree|other", "url": "..."}]}

    -- Visibility: controls whether this venue has a public detail page.
    -- hidden = one-off rental (school, university); stays in DB for event linking.
    -- public  = named recurring space; detail page at /venues/[slug].
    visibility  venue_visibility NOT NULL DEFAULT 'public',

    -- Directory listing flag. DEFAULT false = active curation model.
    -- Nothing appears in /venues directory until explicitly enabled.
    show_in_list boolean NOT NULL DEFAULT false,

    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX idx_venues_slug    ON public.venues (lower(slug));
CREATE INDEX idx_venues_city           ON public.venues (city);
CREATE INDEX idx_venues_country        ON public.venues (country);
CREATE INDEX idx_venues_name_trgm      ON public.venues
    USING GIN (name gin_trgm_ops);
CREATE INDEX idx_venues_links          ON public.venues USING GIN (links);

CREATE TRIGGER trg_venues_updated_at
    BEFORE UPDATE ON public.venues
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venues_select_public" ON public.venues
    FOR SELECT USING (true);

CREATE POLICY "venues_insert_authenticated" ON public.venues
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "venues_update_owner_or_admin" ON public.venues
    FOR UPDATE USING (
        auth.uid() = user_id
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'moderator')
    );

CREATE POLICY "venues_delete_admin" ON public.venues
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));


-- =============================================================================
-- TABLE: event_series
-- Groups related event instances. Serves as template for recurring series.
-- No separate event_templates table — defaults live here. → D-02, D-03
-- =============================================================================

CREATE TABLE public.event_series (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title           text NOT NULL,
    series_type     series_type NOT NULL,
    -- 'recurring': weekly jam, template-driven; 'sequential': workshop arc, order matters
    description     text,
    image_url       text,

    -- Default fields — copied to new instances for recurring series.
    -- All nullable: partial templates allowed. Sequential series leave these null.
    default_type            event_type,
    default_timezone        text,
    default_start_time      time,
    default_end_time        time,
    default_venue_id        uuid REFERENCES public.venues(id) ON DELETE SET NULL,
    default_address         jsonb,
    default_city            text,
    default_country         text,
    default_region          text,
    default_discipline      text[],
    default_language        text[],
    default_level           text,
    default_features        text[],
    default_links           jsonb,
    default_price           jsonb,

    recurrence_rule         text,
    -- RRULE string for UI display only: "RRULE:FREQ=WEEKLY;BYDAY=MO"
    -- null for sequential series.

    created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_event_series_updated_at
    BEFORE UPDATE ON public.event_series
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.event_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_series_select_public" ON public.event_series
    FOR SELECT USING (true);

CREATE POLICY "event_series_insert_authenticated" ON public.event_series
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "event_series_update_owner_or_admin" ON public.event_series
    FOR UPDATE USING (
        auth.uid() = created_by
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'moderator')
    );

CREATE POLICY "event_series_delete_admin" ON public.event_series
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));


-- =============================================================================
-- TABLE: events
-- Core table. Every occurrence is a first-class row. → D-01
-- =============================================================================

CREATE TABLE public.events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    short_id    text UNIQUE,
    -- 4-char alphanumeric slug generated by trigger below → D-16

    -- Series link (both nullable — standalone events have neither)
    series_id       uuid REFERENCES public.event_series(id) ON DELETE SET NULL,
    series_order    integer,
    -- null for recurring series; 1, 2, 3... for sequential series

    -- Content
    title           text NOT NULL,
    description     text,
    type            event_type NOT NULL,
    discipline      text[],
    -- contact_improvisation | bmc | authentic_movement | somatic |
    -- conscious_dance | tango | contango | other
    features        text[],
    -- live_music | silent | outdoor | clothing_optional | beginner_friendly |
    -- all_welcome | queer_friendly | bring_your_own_food | accommodation_included
    image_url       text,
    translations    jsonb,
    -- {"en": {"title": "...", "description": "..."}, "es": {...}} → D-09

    -- Time → D-15
    start_date  date NOT NULL,
    end_date    date NOT NULL,
    -- always set; single-day events: end_date = start_date
    start_time  time,
    end_time    time,
    timezone    text NOT NULL,
    -- IANA format: 'Europe/Berlin', 'Asia/Bangkok', 'America/Bogota'
    -- NO database default — must be explicit on every insert. → D-04
    -- For imports: inherit from import_jobs.default_timezone in application layer.

    -- Location → D-05
    venue_id    uuid REFERENCES public.venues(id) ON DELETE SET NULL,
    address     jsonb,
    -- fallback for one-off locations: {street, city, country, place_id}
    city        text NOT NULL,
    -- English-normalized. Always populated even when venue_id is set.
    country     text NOT NULL,
    -- ISO 3166-1 alpha-2. Always populated.
    region      text,
    lat         double precision,
    lng         double precision,

    -- People
    -- IMPORTANT: PostgreSQL does not enforce FK constraints on array elements.
    -- editors[] references auth.users but is app-validated. → D-11
    editors                 uuid[],
    imported_teacher_text   text,
    -- freetext fallback for imports where teacher name is not yet linked to a profile

    -- Ownership
    user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    claimed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Pricing and links
    price       jsonb,
    -- {"items": [{"amount": 1500, "currency": "EUR", "description": "regular"}]}
    -- amount in minor currency units (cents). Exceptions: HUF, THB use face value.
    links       jsonb,
    -- {"items": [{"type": "registration|website|facebook|instagram|telegram|whatsapp|other",
    --             "url": "https://..."}]}
    segments    jsonb,
    -- {"items": [{"title": "Morning session", "start_time": "10:00",
    --             "end_time": "13:00", "description": "..."}]}

    accommodation_type  text[],
    -- camping | dormitory | shared_room | single_room | double_room | floor_space
    language            text[],
    -- ISO 639-1: ["en", "de", "es"]
    level               text,
    -- all_levels | intermediate_plus | advanced
    capacity            integer,
    contact_email       text,

    -- Moderation → D-07, D-17
    status          event_status NOT NULL DEFAULT 'pending',
    hide            boolean NOT NULL DEFAULT false,
    cancelled       boolean NOT NULL DEFAULT false,
    cancelled_text  text,

    -- Source tracking → D-10
    source          text,
    -- import | manual | user_submission
    source_id       text,
    imported_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Audit
    updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_end_date
        CHECK (end_date >= start_date),
    CONSTRAINT chk_cancelled_text
        CHECK (cancelled = false OR cancelled_text IS NOT NULL),
    CONSTRAINT uq_series_order
        UNIQUE (series_id, series_order)
);

-- Indexes
CREATE INDEX idx_events_start_date ON public.events (start_date);
CREATE INDEX idx_events_end_date   ON public.events (end_date);
CREATE INDEX idx_events_country    ON public.events (country);
CREATE INDEX idx_events_city       ON public.events (city);
CREATE INDEX idx_events_type       ON public.events (type);
CREATE INDEX idx_events_status     ON public.events (status);

-- Most common calendar query: upcoming published events in country X
CREATE INDEX idx_events_date_country_status
    ON public.events (start_date, country, status)
    WHERE hide = false;

CREATE INDEX idx_events_series_id ON public.events (series_id)
    WHERE series_id IS NOT NULL;
CREATE INDEX idx_events_hide      ON public.events (hide) WHERE hide = false;
CREATE INDEX idx_events_cancelled ON public.events (cancelled) WHERE cancelled = true;

-- GIN indexes for array fields (contains queries: discipline @> '{tango}')
CREATE INDEX idx_events_editors    ON public.events USING GIN (editors);
CREATE INDEX idx_events_discipline ON public.events USING GIN (discipline);
CREATE INDEX idx_events_features   ON public.events USING GIN (features);

-- Full-text search → D-01
CREATE INDEX idx_events_title_fts ON public.events
    USING GIN (to_tsvector('english', title));
CREATE INDEX idx_events_description_fts ON public.events
    USING GIN (to_tsvector('english', coalesce(description, '')));

-- Trigram: partial city match ("Berl" → "Berlin"), typo-tolerant
CREATE INDEX idx_events_city_trgm ON public.events
    USING GIN (city gin_trgm_ops);

CREATE UNIQUE INDEX idx_events_short_id ON public.events (short_id);

CREATE TRIGGER trg_events_short_id
    BEFORE INSERT ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.generate_short_id();

CREATE TRIGGER trg_events_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Public: published and not hidden only.
CREATE POLICY "events_select_public" ON public.events
    FOR SELECT USING (hide = false AND status = 'published');

-- Owners see their own events regardless of status.
CREATE POLICY "events_select_own" ON public.events
    FOR SELECT USING (auth.uid() = user_id);

-- Admins and moderators see everything.
CREATE POLICY "events_select_admin" ON public.events
    FOR SELECT USING (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'moderator')
    );

CREATE POLICY "events_insert_authenticated" ON public.events
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "events_update" ON public.events
    FOR UPDATE USING (
        auth.uid() = user_id
        OR auth.uid() = ANY(editors)
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'moderator')
    );

CREATE POLICY "events_delete_admin" ON public.events
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));


-- =============================================================================
-- TABLE: event_teachers
-- Junction: events ↔ teacher profiles.
-- Enables teacher analytics, co-teaching networks, teacher mobility. → D-13
-- =============================================================================

CREATE TABLE public.event_teachers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    teacher_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role        teacher_role NOT NULL DEFAULT 'teacher',
    created_at  timestamptz NOT NULL DEFAULT now(),

    UNIQUE (event_id, teacher_id)
);

CREATE INDEX idx_event_teachers_event   ON public.event_teachers (event_id);
CREATE INDEX idx_event_teachers_teacher ON public.event_teachers (teacher_id);

ALTER TABLE public.event_teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_teachers_select_public" ON public.event_teachers
    FOR SELECT USING (true);

CREATE POLICY "event_teachers_insert" ON public.event_teachers
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.events e
            WHERE e.id = event_id
              AND (e.user_id = auth.uid() OR auth.uid() = ANY(e.editors))
        )
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'moderator')
    );

CREATE POLICY "event_teachers_update" ON public.event_teachers
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.events e
            WHERE e.id = event_id
              AND (e.user_id = auth.uid() OR auth.uid() = ANY(e.editors))
        )
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'moderator')
    );

CREATE POLICY "event_teachers_delete" ON public.event_teachers
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.events e
            WHERE e.id = event_id
              AND (e.user_id = auth.uid() OR auth.uid() = ANY(e.editors))
        )
        OR public.has_role(auth.uid(), 'admin')
    );


-- =============================================================================
-- TABLE: event_organizers
-- Junction: events ↔ organizer profiles. → D-13
-- =============================================================================

CREATE TABLE public.event_organizers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    organizer_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role            organizer_role NOT NULL DEFAULT 'lead',
    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (event_id, organizer_id)
);

CREATE INDEX idx_event_organizers_event     ON public.event_organizers (event_id);
CREATE INDEX idx_event_organizers_organizer ON public.event_organizers (organizer_id);

ALTER TABLE public.event_organizers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_organizers_select_public" ON public.event_organizers
    FOR SELECT USING (true);

CREATE POLICY "event_organizers_insert" ON public.event_organizers
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.events e
            WHERE e.id = event_id
              AND (e.user_id = auth.uid() OR auth.uid() = ANY(e.editors))
        )
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'moderator')
    );

CREATE POLICY "event_organizers_update" ON public.event_organizers
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.events e
            WHERE e.id = event_id
              AND (e.user_id = auth.uid() OR auth.uid() = ANY(e.editors))
        )
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'moderator')
    );

CREATE POLICY "event_organizers_delete" ON public.event_organizers
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.events e
            WHERE e.id = event_id
              AND (e.user_id = auth.uid() OR auth.uid() = ANY(e.editors))
        )
        OR public.has_role(auth.uid(), 'admin')
    );


-- =============================================================================
-- IMPORT PIPELINE TABLES
-- Admin-only. Schema support only — not a production deliverable. → D-10
--
-- Pipeline flow:
--   import_jobs → raw_messages → event_candidates → events(pending) → events(published)
-- =============================================================================

CREATE TABLE public.import_jobs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source              text NOT NULL,
    -- source identifier: channel name, group slug, etc.
    url                 text NOT NULL,
    default_timezone    text,
    -- IANA timezone for this source. → D-04
    -- Events parsed from this job inherit this timezone when not explicitly set.
    storage_path        text,
    status              text NOT NULL DEFAULT 'pending',
    -- pending | running | success | failed
    started_at          timestamptz DEFAULT now(),
    finished_at         timestamptz,
    error_message       text,
    raw_type            text NOT NULL DEFAULT 'html',
    -- html | json | channel
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_import_jobs_updated_at
    BEFORE UPDATE ON public.import_jobs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_jobs_admin_only" ON public.import_jobs
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------

CREATE TABLE public.raw_messages (
    -- Source-neutral staging for inbound channel messages.
    -- UNIQUE(chat_id, message_id) ensures idempotent inserts.
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    import_job_id       uuid REFERENCES public.import_jobs(id) ON DELETE SET NULL,
    message_id          text NOT NULL,
    chat_id             text NOT NULL,
    sender_id           text,
    text                text,
    sent_at             timestamptz,
    has_media           boolean NOT NULL DEFAULT false,
    processed           boolean NOT NULL DEFAULT false,
    is_event_candidate  boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE(chat_id, message_id)
);

ALTER TABLE public.raw_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "raw_messages_admin_only" ON public.raw_messages
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------

CREATE TABLE public.event_candidates (
    -- Parsed event data. Pip's full workspace: dedup, LLM enrichment, promotion tracking.
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    import_job_id   uuid REFERENCES public.import_jobs(id) ON DELETE CASCADE,
    source          text NOT NULL,
    raw_type        text NOT NULL DEFAULT 'html',
    event_data      jsonb NOT NULL,
    -- {title, start_date, end_date, city, country, timezone, type,
    --  price, description, discipline, external_url, imported_teacher_text}
    parse_status    text NOT NULL DEFAULT 'parsed',
    -- parsed | error
    parse_error     text,

    -- Pip workspace fields (dedup + promotion tracking)
    dedup_status        text NOT NULL DEFAULT 'pending',
    -- pending | unique | duplicate | merged | promoted
    matched_event_id    uuid REFERENCES public.events(id) ON DELETE SET NULL,
    -- set if dedup finds an existing event match
    llm_notes           text,
    -- AI enrichment / dedup reasoning from Pip
    promoted_event_id   uuid REFERENCES public.events(id) ON DELETE SET NULL,
    -- FK to the events row this candidate was promoted into

    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_candidates_admin_only" ON public.event_candidates
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));


-- =============================================================================
-- SCHEDULED JOBS (pg_cron)
-- Requires pg_cron extension enabled in Supabase dashboard:
-- Database → Extensions → pg_cron
-- =============================================================================

-- Auto-archive past events. Runs daily at 02:00 UTC.
-- Keeps homepage fresh — no stale events in public calendar.
-- Only archives published events; drafts and pending stay untouched.
SELECT cron.schedule(
    'archive-past-events',
    '0 2 * * *',
    $$
        UPDATE public.events
        SET status = 'archived'
        WHERE end_date < current_date
          AND status = 'published';
    $$
);


-- =============================================================================
-- END OF SCHEMA
--
-- Tables:
--   user_roles, profiles, venues, event_series, events,
--   event_teachers, event_organizers,
--   import_jobs, raw_messages, event_candidates
--
-- Deferred to v2 (do not add without discussion):
--   event_likes, event_comments, participants (social features)
--   regions (lookup table for sub-country filtering)
--   organizations + event_organizations (brand pages)
--
-- Known limitations:
--   editors uuid[] on events: no DB-level FK enforcement.
--   Application layer must validate UUIDs exist in auth.users before insert.
--
-- Before deploying to a new project:
--   1. Confirm pg_trgm AND pg_cron extensions enabled in Supabase dashboard
--      (Database → Extensions)
--   2. Review RLS policies before going live
--   3. series_order enforcement for sequential series is application-layer:
--      if series.series_type = 'sequential', series_order must be set on insert
-- =============================================================================
