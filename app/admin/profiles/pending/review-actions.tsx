"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { approveProfile, rejectProfile, requestMoreInfo } from "./actions";

export function ProfileReviewActions({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [reason, setReason] = useState("");
  const [nudgeMessage, setNudgeMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function act(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error ?? "Action failed.");
      }
    });
  }

  // Unlike approve/reject, this doesn't change the row, so router.refresh() wouldn't remove it
  // from the list — confirm the send with an inline notice instead.
  function sendNudge() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await requestMoreInfo(profileId, nudgeMessage);
      if (result.success) {
        setNotice("Email sent.");
        setShowNudge(false);
        setNudgeMessage("");
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
          onClick={() => act(() => approveProfile(profileId))}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setShowNudge((v) => !v)}
          className="rounded-full border border-(--color-sand-strong) px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          Request more info
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setShowReject((v) => !v)}
          className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
        >
          Reject
        </button>
      </div>

      {showNudge ? (
        <div className="flex w-full max-w-md flex-col items-end gap-2">
          <textarea
            value={nudgeMessage}
            onChange={(e) => setNudgeMessage(e.target.value)}
            placeholder="What should they add? (e.g. a bio and a link) — emails them, leaves this profile pending"
            className="w-full rounded-2xl border border-(--color-sand-strong) bg-white px-3 py-2 text-sm outline-none focus:border-(--color-pine)"
            rows={2}
          />
          <button
            type="button"
            disabled={pending}
            onClick={sendNudge}
            className="rounded-full bg-(--color-ink) px-4 py-2 text-sm font-semibold text-(--color-mist) disabled:opacity-50"
          >
            Send request
          </button>
        </div>
      ) : null}

      {showReject ? (
        <div className="flex w-full max-w-md flex-col items-end gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason shown to the submitter (optional) — rejecting deletes this profile"
            className="w-full rounded-2xl border border-(--color-sand-strong) bg-white px-3 py-2 text-sm outline-none focus:border-(--color-pine)"
            rows={2}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => rejectProfile(profileId, reason))}
            className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Confirm reject &amp; delete
          </button>
        </div>
      ) : null}

      {notice ? <p className="text-xs text-emerald-700">{notice}</p> : null}
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
