"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { resolveEditSuggestion } from "./actions";

export function ResolveSuggestionActions({ suggestionId }: { suggestionId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resolve(status: "applied" | "dismissed") {
    setError(null);
    startTransition(async () => {
      const result = await resolveEditSuggestion(suggestionId, status, note);
      if (result.success) router.refresh();
      else setError(result.error ?? "Action failed.");
    });
  }

  return (
    <div className="flex w-full max-w-xs flex-col items-end gap-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional, internal)"
        className="w-full rounded-2xl border border-(--color-sand-strong) bg-white px-3 py-2 text-sm outline-none focus:border-(--color-pine)"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => resolve("applied")}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Applied
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => resolve("dismissed")}
          className="rounded-full border border-(--color-sand-strong) px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
