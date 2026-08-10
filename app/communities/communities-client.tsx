"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ExternalLink, Lock, MapPin, MessageCircle, Send, Search, X, Filter, Map, List } from "lucide-react";

import { COMMUNITY_ISSUE_URL, COMMUNITY_SUBMIT_URL, isLineUrl, isMessengerUrl, isPrivateGroupInvite, type Community } from "@/lib/communities";
import { TELEGRAM_URL } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { CONTINENT_COUNTRIES, CONTINENT_LABELS } from "@/lib/continents";
import { PLATFORM_ICON_CLASS, TelegramIcon, WhatsAppIcon, SignalIcon } from "@/components/platform-icons";
import { BackToTopButton } from "@/components/back-to-top-button";

const WORLDWIDE_VALUE = "__worldwide";

type CommunitiesClientProps = {
  initialCommunities: Community[];
  initialCountries: Array<{ value: string; label: string }>;
  initialError: string | null;
};

// Dynamically load the Map component without SSR
const CommunityMap = dynamic(() => import("@/components/community-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent"></div>
        <p className="text-sm font-medium">Loading Interactive Map...</p>
      </div>
    </div>
  ),
});

export function CommunitiesClient({
  initialCommunities,
  initialCountries,
  initialError,
}: CommunitiesClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Search query: local state only
  const [searchQuery, setSearchQuery] = useState("");

  // Filters from URL
  const selectedCountry = searchParams.get("country") ?? "";
  const selectedType = searchParams.get("type") ?? "";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `/communities?${qs}` : "/communities", { scroll: false });
  }

  const setSelectedCountry = (v: string) => setParam("country", v);
  const setSelectedType = (v: string) => setParam("type", v);

  // Interaction state
  const [highlightedCommunityId, setHighlightedCommunityId] = useState<string | null>(null);

  // Mobile view state: 'list' | 'map'
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFilterCount = [selectedCountry, selectedType].filter(Boolean).length;

  // Reset all filters
  const resetFilters = () => {
    router.replace("/communities", { scroll: false });
    setSearchQuery("");
    setHighlightedCommunityId(null);
  };

  // Group country options into the project's three business regions (Americas / EMEA /
  // Asia-Pacific — same CONTINENT_COUNTRIES used on the events page), plus a "Worldwide" group
  // for communities with no single country.
  const groupedCountryOptions = useMemo(() => {
    const groups = (["americas", "emea", "apac"] as const).map((key) => ({
      key,
      label: CONTINENT_LABELS[key],
      value: `__continent_${key}`,
      countries: initialCountries.filter((o) => CONTINENT_COUNTRIES[key].includes(o.value)),
    }));
    const hasWorldwide = initialCommunities.some((c) => c.countryIso === null);
    return { groups: groups.filter((g) => g.countries.length > 0), hasWorldwide };
  }, [initialCountries, initialCommunities]);

  // Extract unique types from loaded communities list
  const typeOptions = useMemo(() => {
    const types = Array.from(new Set(initialCommunities.map((c) => c.type).filter((t): t is string => !!t)));
    return types
      .map((t) => ({ value: t, label: t }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [initialCommunities]);

  // Filter communities locally
  const filteredCommunities = useMemo(() => {
    return initialCommunities.filter((community) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const nameMatch = community.name?.toLowerCase().includes(query);
        const descMatch = community.description?.toLowerCase().includes(query);
        const cityMatch = community.city?.toLowerCase().includes(query);
        const countryMatch = community.country?.toLowerCase().includes(query);
        if (!nameMatch && !descMatch && !cityMatch && !countryMatch) {
          return false;
        }
      }

      // 2. Country / Continent Match
      if (selectedCountry) {
        if (selectedCountry === WORLDWIDE_VALUE) {
          if (community.countryIso !== null) return false;
        } else if (selectedCountry.startsWith("__continent_")) {
          const key = selectedCountry.slice("__continent_".length);
          if (!community.countryIso || !CONTINENT_COUNTRIES[key]?.includes(community.countryIso)) return false;
        } else if (community.countryIso !== selectedCountry) {
          return false;
        }
      }

      // 3. Community Type Match
      if (selectedType && community.type !== selectedType) {
        return false;
      }

      return true;
    });
  }, [initialCommunities, searchQuery, selectedCountry, selectedType]);

  // Rendering all ~140 filtered communities into the DOM on mount was the same TBT problem
  // found and fixed on the events page (see I-136) — same fix here. The map still gets every
  // community for its markers, only the card list itself is paginated.
  const COMMUNITIES_PAGE_SIZE = 20;
  const [visibleCommunityCount, setVisibleCommunityCount] = useState(COMMUNITIES_PAGE_SIZE);
  const listScrollRef = useRef<HTMLDivElement>(null);

  // Reset pagination whenever the filtered set actually changes — adjusted during render
  // (React's documented pattern for "reset state when a value changes") rather than in an
  // effect, so the reset lands in the same commit instead of costing an extra render pass.
  const [prevFilteredCommunities, setPrevFilteredCommunities] = useState<Community[] | null>(null);
  if (filteredCommunities !== prevFilteredCommunities) {
    setPrevFilteredCommunities(filteredCommunities);
    setVisibleCommunityCount(COMMUNITIES_PAGE_SIZE);
  }

  const visibleCommunities = useMemo(
    () => filteredCommunities.slice(0, visibleCommunityCount),
    [filteredCommunities, visibleCommunityCount]
  );

  const handleShowOnMap = useCallback((communityId: string) => {
    setHighlightedCommunityId(communityId);
    // Switch to map view on mobile
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setMobileView("map");
    }
  }, []);

  const handleMarkerClick = useCallback((communityId: string) => {
    // The map plots every filtered community regardless of how many cards are loaded in the
    // list, so a clicked marker's card may not exist in the DOM yet. Expand the loaded page
    // (rounded up to a full page) to cover it — the actual scroll happens in the effect below,
    // once React has committed the newly-revealed card.
    setVisibleCommunityCount((current) => {
      const index = filteredCommunities.findIndex((c) => c.id === communityId);
      if (index >= current) {
        return Math.ceil((index + 1) / COMMUNITIES_PAGE_SIZE) * COMMUNITIES_PAGE_SIZE;
      }
      return current;
    });
    setHighlightedCommunityId(communityId);
  }, [filteredCommunities]);

  useEffect(() => {
    if (!highlightedCommunityId) return;
    const cardElement = document.getElementById(`community-card-${highlightedCommunityId}`);
    cardElement?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlightedCommunityId, visibleCommunityCount]);

  // Error state
  if (initialError) {
    return (
      <div className="mx-auto max-w-4xl text-center">
        <div className="mb-6 rounded-2xl border-2 border-amber-200 bg-amber-50 p-6">
          <p className="mb-2 font-serif text-2xl text-amber-900">
            Unable to load communities
          </p>
          <p className="text-amber-800">{initialError}</p>
        </div>
        <p className="text-sm text-slate-500">
          Please try again later or contact us if the problem persists.
        </p>
      </div>
    );
  }

  return (
    <>
        {/* Search & Filter Toolbar */}
        <div className="mb-8 flex flex-col gap-4 rounded-xl border border-(--color-sand-strong) bg-white p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* Search bar */}
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, city, or country..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-3 pr-4 pl-11 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute top-1/2 right-4 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {/* Mobile controls */}
            <div className="flex gap-2 border-t border-slate-100 pt-3 sm:border-none sm:pt-0 lg:hidden">
              <button
                onClick={() => setFiltersOpen((o) => !o)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  filtersOpen || activeFilterCount > 0
                    ? "bg-violet-100 text-violet-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Filter className="size-4" />
                Filters
                {activeFilterCount > 0 && !filtersOpen && (
                  <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <div className="flex flex-1">
                <button
                  onClick={() => setMobileView("list")}
                  className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition ${
                    mobileView === "list"
                      ? "bg-violet-100 text-violet-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <List className="size-4" />
                  List
                </button>
                <button
                  onClick={() => setMobileView("map")}
                  className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition ${
                    mobileView === "map"
                      ? "bg-violet-100 text-violet-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Map className="size-4" />
                  Map
                </button>
              </div>
            </div>
          </div>

          {/* Extended filters */}
          <div className={`flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 md:pt-4 ${filtersOpen ? "flex" : "hidden"} lg:flex`}>
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <select
                aria-label="Filter by country"
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:w-44"
              >
                <option value="">All Countries</option>
                {groupedCountryOptions.groups.map((group) => (
                  <optgroup key={group.key} label={group.label}>
                    <option value={group.value}>All {group.label}</option>
                    {group.countries.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </optgroup>
                ))}
                {groupedCountryOptions.hasWorldwide && (
                  <optgroup label="Worldwide">
                    <option value={WORLDWIDE_VALUE}>Worldwide / International</option>
                  </optgroup>
                )}
              </select>

              <select
                aria-label="Filter by community type"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:w-44"
              >
                <option value="">All Types</option>
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 w-full justify-between sm:w-auto sm:justify-end border-t border-slate-50 pt-2 sm:border-none sm:pt-0">
              <span>
                {filteredCommunities.length} of {initialCommunities.length} communities
              </span>
              {(searchQuery || selectedCountry || selectedType) && (
                <button
                  onClick={resetFilters}
                  className="text-violet-600 hover:text-violet-800 transition"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Viewport Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-320px)] min-h-[500px]">
          {/* List Column */}
          <div
            className={`relative lg:col-span-4 h-full min-h-0 ${
              mobileView === "list" ? "block" : "hidden lg:block"
            }`}
          >
            <div ref={listScrollRef} className="h-full overflow-y-auto pr-1 space-y-3">
              {visibleCommunities.length > 0 ? (
                <>
                  {visibleCommunities.map((community) => (
                    <div
                      key={community.id}
                      id={`community-card-${community.id}`}
                      className={`transition rounded-2xl ${
                        highlightedCommunityId === community.id
                          ? "ring-2 ring-violet-500 ring-offset-2 scale-[0.99] shadow-sm"
                          : ""
                      }`}
                    >
                      <CommunityCard
                        community={community}
                        onShowOnMap={() => handleShowOnMap(community.id)}
                      />
                    </div>
                  ))}
                  {visibleCommunityCount < filteredCommunities.length && (
                    <div className="flex justify-center pt-2 pb-4">
                      <Button
                        onClick={() => setVisibleCommunityCount((c) => c + COMMUNITIES_PAGE_SIZE)}
                        variant="outline"
                        size="sm"
                        className="border-violet-200 text-violet-600 hover:bg-violet-50"
                      >
                        Load more ({filteredCommunities.length - visibleCommunityCount} remaining)
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/75 px-6 py-16 text-center">
                  <p className="font-serif text-xl text-slate-900 font-medium">No communities found.</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Try widening your parameters or clearing the search box.
                  </p>
                  <Button
                    onClick={resetFilters}
                    variant="outline"
                    size="sm"
                    className="mt-4 border-violet-200 text-violet-600 hover:bg-violet-50"
                  >
                    Reset Filters
                  </Button>
                </div>
              )}
            </div>
            <BackToTopButton containerRef={listScrollRef} />
          </div>

          {/* Map Column */}
          <div
            className={`lg:col-span-8 h-full ${
              mobileView === "map" ? "block" : "hidden lg:block"
            }`}
          >
            <CommunityMap
              communities={filteredCommunities}
              highlightedCommunityId={highlightedCommunityId}
              onMarkerClick={handleMarkerClick}
              onReset={() => setHighlightedCommunityId(null)}
              visible={mobileView === "map"}
            />
          </div>
        </div>

        <section className="mt-12 rounded-2xl bg-(--color-pine) p-8 text-center text-white">
          <h2 className="mb-2 font-serif text-2xl">Know a community we&apos;re missing?</h2>
          <p className="mx-auto mb-6 max-w-2xl text-sm leading-6 text-white/75">
            Add it, flag something that&apos;s out of date, or just say hi in our global Telegram group.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href={COMMUNITY_SUBMIT_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-(--color-pine) transition hover:bg-slate-100"
            >
              <ExternalLink className="size-4" />
              Add a community
            </Link>
            <Link
              href={COMMUNITY_ISSUE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/10 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/20"
            >
              <ExternalLink className="size-4" />
              Suggest a correction
            </Link>
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/10 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/20"
            >
              <TelegramIcon className="size-4" />
              Join the global conversation
            </a>
          </div>
        </section>
    </>
  );
}

type CommunityCardProps = {
  community: Community;
  onShowOnMap?: () => void;
};

export function CommunityCard({ community, onShowOnMap }: CommunityCardProps) {
  const linkIconClass = PLATFORM_ICON_CLASS;
  // Requires onShowOnMap, not just coordinates — callers without a map-highlight
  // interaction (e.g. the country page) simply don't get this button rather than
  // rendering one that does nothing on click.
  const hasCoords = community.latitude !== null && community.longitude !== null && Boolean(onShowOnMap);

  return (
    <div className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-(--color-sand-strong) bg-white p-4 transition hover:shadow-lg">
      {/* Whole card links to the detail page; icon row above sits at a higher z-index so those links remain independently clickable */}
      <Link href={`/communities/${community.slug}`} className="absolute inset-0 z-10" aria-label={community.name} />

      {/* Name + location */}
      <h2 className="mb-1 font-serif text-lg text-slate-900 wrap-break-word">{community.name}</h2>
      <p className="mb-3 flex min-w-0 items-center gap-1 text-sm text-slate-500">
        <MapPin className="size-3 shrink-0 text-slate-400" />
        <span className="min-w-0 wrap-break-word">
          {community.city}
          {community.city && community.country && ", "}
          {community.country}
        </span>
      </p>

      {/* Platform links */}
      <div className="mb-3 flex flex-wrap gap-2">
        {hasCoords && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onShowOnMap?.();
            }}
            className={`${linkIconClass} text-violet-600 hover:text-violet-800`}
            aria-label="Show on map"
          >
            <Map className="size-4" />
          </button>
        )}
        {community.websiteUrl && (
          <a href={community.websiteUrl} target="_blank" rel="noopener noreferrer" className={linkIconClass} aria-label="Website">
            <ExternalLink className="size-4" />
          </a>
        )}
        {community.facebookGroupUrl && (
          <a href={community.facebookGroupUrl} target="_blank" rel="noopener noreferrer" className={linkIconClass} aria-label="Facebook group">
            <FacebookIcon />
          </a>
        )}
        {community.facebookPageUrl && (
          <a href={community.facebookPageUrl} target="_blank" rel="noopener noreferrer" className={linkIconClass} aria-label="Facebook page">
            <FacebookIcon />
          </a>
        )}
        {community.instagramUrl && (
          <a href={community.instagramUrl} target="_blank" rel="noopener noreferrer" className={linkIconClass} aria-label="Instagram">
            <InstagramIcon />
          </a>
        )}
        {community.calendarUrl && (
          <a href={community.calendarUrl} target="_blank" rel="noopener noreferrer" className={linkIconClass} aria-label="Calendar">
            <CalendarDays className="size-4" />
          </a>
        )}
        {community.telegramChannelUrl && !isPrivateGroupInvite(community.telegramChannelUrl) && (
          <a href={community.telegramChannelUrl} target="_blank" rel="noopener noreferrer" className={linkIconClass} aria-label="Telegram channel">
            <MessageCircle className="size-4" />
          </a>
        )}
        {community.whatsappChannelUrl && !isPrivateGroupInvite(community.whatsappChannelUrl) && (
          <a href={community.whatsappChannelUrl} target="_blank" rel="noopener noreferrer" className={linkIconClass} aria-label="WhatsApp channel">
            <MessageCircle className="size-4" />
          </a>
        )}
        {community.newsletterUrl && (
          <a href={community.newsletterUrl} target="_blank" rel="noopener noreferrer" className={linkIconClass} aria-label="Newsletter">
            <Send className="size-4" />
          </a>
        )}
        {community.otherResourceUrl && (
          <a
            href={community.otherResourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={linkIconClass}
            aria-label={
              isMessengerUrl(community.otherResourceUrl)
                ? "Messenger group"
                : isLineUrl(community.otherResourceUrl)
                  ? "LINE group"
                  : "Other resource"
            }
          >
            {isMessengerUrl(community.otherResourceUrl) ? (
              <MessengerIcon />
            ) : isLineUrl(community.otherResourceUrl) ? (
              <LineIcon />
            ) : (
              <ExternalLink className="size-4" />
            )}
          </a>
        )}
        {/* Gated invites: same icon row, but these link into the detail page's join
            section rather than the platform directly — the lock signals the extra
            verification step instead of an instant external jump. */}
        {community.hasTelegramInvite && (
          <GatedPlatformIcon slug={community.slug} label="Telegram group" icon={<TelegramIcon className="size-4" />} />
        )}
        {community.hasWhatsappInvite && (
          <GatedPlatformIcon slug={community.slug} label="WhatsApp group" icon={<WhatsAppIcon />} />
        )}
        {community.hasSignalInvite && (
          <GatedPlatformIcon slug={community.slug} label="Signal group" icon={<SignalIcon />} />
        )}
        {community.hasLineInvite && (
          <GatedPlatformIcon slug={community.slug} label="LINE group" icon={<LineIcon />} />
        )}
      </div>

      {/* Description */}
      {community.description && (
        <p className="mb-3 line-clamp-2 wrap-break-word text-sm text-slate-600">{community.description}</p>
      )}
    </div>
  );
}

function GatedPlatformIcon({
  slug,
  icon,
  label,
}: {
  slug: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={`/communities/${slug}#invite`}
      className={PLATFORM_ICON_CLASS}
      aria-label={`${label} — verification required to join`}
    >
      {icon}
      <span className="absolute -bottom-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-amber-500 text-white ring-2 ring-white">
        <Lock className="size-2" strokeWidth={3} />
      </span>
    </Link>
  );
}

function FacebookIcon() {
  return (
    <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function MessengerIcon() {
  return (
    <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.093 0 11.552c0 3.686 1.745 6.972 4.472 9.12V24l4.086-2.242c1.09.301 2.246.464 3.442.464 6.627 0 12-5.093 12-11.552C24 5.093 18.627 0 12 0Zm1.191 15.527-3.055-3.26-5.963 3.26L10.732 9l3.131 3.259L19.752 9l-6.561 6.527Z" />
    </svg>
  );
}

function LineIcon() {
  // LINE app logo mark, from Simple Icons (CC0), fill swapped to currentColor.
  return (
    <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

