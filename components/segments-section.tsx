"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, User } from "lucide-react";
import { type SegmentsData, formatSegmentWhen } from "@/lib/event-display";
import { slugify } from "@/lib/slug";

interface SegmentsSectionProps {
  segments: SegmentsData;
  teacherProfiles?: Array<{ name: string; slug?: string | null }>;
}

export function SegmentsSection({ segments, teacherProfiles = [] }: SegmentsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(segments.items.length <= 2);
  const showCollapseToggle = segments.items.length > 2;

  const displayedItems = isExpanded ? segments.items : segments.items.slice(0, 2);

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl text-slate-950">Program Segments</h2>
        {showCollapseToggle && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-sm font-medium text-(--color-pine) hover:underline"
          >
            {isExpanded ? (
              <>
                Show less <ChevronUp className="size-4" />
              </>
            ) : (
              <>
                Show all {segments.items.length} segments <ChevronDown className="size-4" />
              </>
            )}
          </button>
        )}
      </div>

      <div className="grid gap-4">
        {displayedItems.map((segment, index) => {
          const when = formatSegmentWhen(segment);
          return (
          <div
            key={`${segment.title}-${index}`}
            className="rounded-[1.5rem] border border-(--color-sand-strong) bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6"
          >
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <h3 className="font-serif text-xl leading-tight text-slate-900">{segment.title}</h3>
              {when && (
                <span className="shrink-0 text-sm font-semibold text-(--color-pine)">{when}</span>
              )}
            </div>

            {segment.teachers && segment.teachers.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {segment.teachers.map((teacherName) => {
                  const normalizedName = slugify(teacherName);
                  const profile = teacherProfiles.find(
                    (p) => p.slug === normalizedName || (p.name && slugify(p.name) === normalizedName)
                  );

                  const content = (
                    <>
                      <User className="size-3 text-slate-400 group-hover:text-(--color-pine) transition-colors" />
                      {teacherName}
                    </>
                  );

                  if (profile?.slug) {
                    return (
                      <Link
                        key={teacherName}
                        href={`/teachers/${profile.slug}`}
                        className="group inline-flex items-center gap-1.5 rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-(--color-pine) hover:text-(--color-pine) hover:shadow-sm"
                      >
                        {content}
                      </Link>
                    );
                  }

                  return (
                    <span
                      key={teacherName}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600"
                    >
                      {content}
                    </span>
                  );
                })}
              </div>
            )}

            {segment.description && (
              <p className="mt-4 text-sm leading-relaxed text-slate-600 whitespace-pre-line">
                {segment.description}
              </p>
            )}
          </div>
          );
        })}
      </div>

      {showCollapseToggle && !isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full rounded-[1.5rem] border border-dashed border-(--color-sand-strong) bg-white/50 py-4 text-sm font-medium text-slate-500 transition hover:bg-white hover:text-(--color-pine)"
        >
          + {segments.items.length - 2} more segments
        </button>
      )}
    </section>
  );
}
