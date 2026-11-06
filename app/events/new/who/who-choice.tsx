"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveSharedSubmission } from "@/app/events/actions";

// Step 2 choices. Organize and teach can both be ticked; neither ticked means passing it on.
export function WhoChoice({ eventId, ticket }: { eventId: string; ticket: string }) {
  const router = useRouter();
  const [organize, setOrganize] = useState(false);
  const [teach, setTeach] = useState(false);
  const [email, setEmail] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const involved = organize || teach;

  function claim() {
    const roles = [...(organize ? ["organizer"] : []), ...(teach ? ["teacher"] : [])].join(",");
    const claimUrl = `/events/new/claim?${new URLSearchParams({ e: eventId, t: ticket, r: roles })}`;
    // The claim route sends signed-out visitors through sign-in and back.
    router.push(claimUrl);
  }

  function share() {
    setError(null);
    startTransition(async () => {
      const result = await saveSharedSubmission(eventId, ticket, email, newsletter);
      if (!result.ok) setError(result.error);
      else if (result.newsletter === "pending") router.push("/events/new/done?state=thanks&newsletter=pending");
      else router.push("/events/new/done?state=thanks");
    });
  }

  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-slate-700">Tick what applies</legend>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={organize} onChange={(e) => setOrganize(e.target.checked)} />
          I organize it
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={teach} onChange={(e) => setTeach(e.target.checked)} />
          I teach at it
        </label>
      </fieldset>

      {involved ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Sign in to manage the event yourself: add the description, prices, teachers and a photo now or later, and
            change it any time. With Google it&apos;s two clicks.
          </p>
          <button
            type="button"
            onClick={claim}
            className="rounded-full bg-(--color-pine) px-6 py-3 text-sm font-semibold text-white"
          >
            Sign in and add details
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            You&apos;re passing it on: thank you! We check it, add the details and publish it.
          </p>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">Your email (optional)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={200}
              className="w-full rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-(--color-pine)"
            />
            <span className="block text-xs text-slate-500">
              We&apos;ll only use it to ask you about this event and to tell you when it&apos;s live. Never shown.
            </span>
          </label>
          {/* Unticked by default: a pre-ticked box is not valid consent (Planet49), and the newsletter is
              never a condition of passing an event on (Art. 7(4) GDPR). */}
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={newsletter}
              onChange={(e) => setNewsletter(e.target.checked)}
              className="mt-1"
            />
            <span>
              Also send me the newsletter: festivals, workshops and news from the CI world. You confirm it once by
              email.
            </span>
          </label>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          <button
            type="button"
            onClick={share}
            disabled={isSubmitting}
            className="rounded-full bg-(--color-pine) px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isSubmitting ? "Saving..." : "Done"}
          </button>
        </div>
      )}
    </div>
  );
}
