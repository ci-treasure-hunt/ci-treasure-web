"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { approveCommunity, rejectCommunity } from "./actions";

export function CommunityReviewActions({ communityId }: { communityId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function act(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.success) router.refresh();
      else setError(result.error ?? "Action failed.");
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => approveCommunity(communityId))}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Approve
        </button>
        <Link
          href={`/admin/communities/${communityId}/edit`}
          className="rounded-full border border-(--color-sand-strong) px-4 py-2 text-sm font-semibold text-slate-700"
        >
          Edit before approving
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() => setShowReject((v) => !v)}
          className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
        >
          Reject
        </button>
      </div>

      {showReject ? (
        <div className="flex w-full max-w-md flex-col items-end gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (internal, kept in admin notes)"
            className="w-full rounded-2xl border border-(--color-sand-strong) bg-white px-3 py-2 text-sm outline-none focus:border-(--color-pine)"
            rows={2}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => rejectCommunity(communityId, reason))}
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
