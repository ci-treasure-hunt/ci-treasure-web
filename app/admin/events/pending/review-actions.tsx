"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { approveEvent, approveSeries, rejectEvent, rejectSeries, trustOrganizer } from "./actions";

// One event, or (I-171) every pending date of a series at once when `series` is given.
export function EventReviewActions({
  eventId,
  organizer,
  series,
}: {
  eventId: string;
  organizer: { profileId: string; name: string; isTrusted: boolean } | null;
  series?: { id: string; count: number };
}) {
  const allLabel = series ? ` all ${series.count}` : "";
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function act(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error ?? "Action failed.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => (series ? approveSeries(series.id) : approveEvent(eventId)))}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Approve{allLabel}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setShowReject((v) => !v)}
          className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
        >
          Reject{allLabel}
        </button>
        {organizer && !organizer.isTrusted ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => trustOrganizer(organizer.profileId))}
            className="rounded-full border border-(--color-sand-strong) px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Trust {organizer.name.split(" ")[0]}
          </button>
        ) : null}
        {organizer?.isTrusted ? (
          <span className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800">Trusted</span>
        ) : null}
      </div>

      {showReject ? (
        <div className="flex w-full max-w-md flex-col items-end gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason shown to the organizer (optional)"
            className="w-full rounded-2xl border border-(--color-sand-strong) bg-white px-3 py-2 text-sm outline-none focus:border-(--color-pine)"
            rows={2}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => (series ? rejectSeries(series.id, reason) : rejectEvent(eventId, reason)))}
            className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Confirm reject
          </button>
        </div>
      ) : null}

      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
