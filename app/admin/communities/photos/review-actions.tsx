"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { approveCommunityPhoto, rejectCommunityPhoto } from "./actions";

export function CommunityPhotoReviewActions({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
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
    <div className="flex w-full max-w-xs flex-col items-end gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => approveCommunityPhoto(submissionId))}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => rejectCommunityPhoto(submissionId, note))}
          className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reject reason (optional, internal)"
        className="w-full rounded-2xl border border-(--color-sand-strong) bg-white px-3 py-2 text-sm outline-none focus:border-(--color-pine)"
      />
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
