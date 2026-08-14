"use client";

import { useState } from "react";
import { submitReport } from "@/lib/report-action";
import type { ReportInput } from "@/lib/report-action";

const REASONS = [
  { value: "incorrect_info", label: "Incorrect or outdated information" },
  { value: "spam_fake", label: "Spam or fake listing" },
  { value: "copyright", label: "Copyright infringement" },
  { value: "inappropriate_photo", label: "Inappropriate photo" },
  { value: "illegal_other", label: "Other / illegal content" },
] as const;

// I-159: the Art. 21 GDPR right to object, offered from the page the data is on. Profiles only —
// ReportButton is shared with events, venues and communities, none of which carry a data-subject
// right, and offering "remove my data" there would invite requests that aren't Art. 21 requests.
const PRIVACY_OBJECTION = {
  value: "privacy_objection",
  label: "This is my profile, please remove it",
} as const;

type Props = Omit<ReportInput, "reason" | "details" | "reporter_email">;

type State = "idle" | "submitting" | "success" | "rate_limited" | "invalid_email" | "error";

export function ReportButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");

  const reasons = props.entity_type === "profile" ? [...REASONS, PRIVACY_OBJECTION] : REASONS;
  const isObjection = reason === PRIVACY_OBJECTION.value;

  function handleOpen() {
    setOpen(true);
    setState("idle");
    setReason("");
    setDetails("");
    setEmail("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return;
    setState("submitting");
    const result = await submitReport({
      ...props,
      reason,
      details,
      ...(isObjection ? { reporter_email: email } : {}),
    });
    setState(result.success ? "success" : (result.error as State) ?? "error");
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="text-sm text-slate-400 underline hover:text-slate-600"
      >
        Report
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-[1.5rem] border border-white/80 bg-white p-6 shadow-xl">
            <h2 className="font-serif text-xl text-slate-950">
              Report this listing
            </h2>

            {state === "success" ? (
              <div className="mt-4 space-y-4">
                <p className="text-slate-600">
                  {isObjection
                    ? "Thank you. We'll remove your profile and email you to confirm."
                    : "Thank you, we'll review this."}
                </p>
                <button
                  onClick={() => setOpen(false)}
                  className="text-sm text-slate-500 underline"
                >
                  Close
                </button>
              </div>
            ) : state === "rate_limited" ? (
              <div className="mt-4 space-y-4">
                <p className="text-slate-600">
                  Too many reports from this connection. Please try again later.
                </p>
                <button
                  onClick={() => setOpen(false)}
                  className="text-sm text-slate-500 underline"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Reason
                  </label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    className="w-full rounded-xl border border-(--color-sand-strong) bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-(--color-pine)"
                  >
                    <option value="">Select a reason…</option>
                    {reasons.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                {isObjection && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Your email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full rounded-xl border border-(--color-sand-strong) bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-(--color-pine)"
                      placeholder="you@example.com"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      So we can confirm the request is yours and let you know once it&apos;s done. We
                      won&apos;t add you to anything.
                    </p>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Additional details{" "}
                    <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <textarea
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-(--color-sand-strong) bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-(--color-pine)"
                    placeholder="Any additional context…"
                  />
                </div>

                {state === "invalid_email" && (
                  <p className="text-sm text-red-600">
                    Please enter a valid email address so we can reply.
                  </p>
                )}

                {state === "error" && (
                  <p className="text-sm text-red-600">
                    Something went wrong. Please try again.
                  </p>
                )}

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-sm text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={state === "submitting" || !reason}
                    className="rounded-full bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    {state === "submitting" ? "Submitting…" : "Submit report"}
                  </button>
                </div>

                <p className="text-xs text-slate-400">
                  Want a reply?{" "}
                  <a
                    href="mailto:hello@citreasurehunt.com"
                    className="underline hover:text-slate-600"
                  >
                    Email us
                  </a>{" "}
                  directly.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
