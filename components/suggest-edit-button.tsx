"use client";

// I-111 Stage 2: "Suggest an edit" for a community, next to the Report button on its page. Modelled
// on report-button.tsx; the difference is that this one asks for the corrected content, and goes
// behind Turnstile because the text lands in an admin queue.

import { useState, useTransition } from "react";
import { Turnstile } from "@marsidev/react-turnstile";

import { SUGGESTION_FIELDS, SUGGESTION_TYPES, TYPES_WITH_FIELDS } from "@/lib/community-suggest-options";
import { suggestCommunityEdit } from "@/lib/community-suggest-action";

export function SuggestEditButton({ communityId, communityName }: { communityId: string; communityName: string }) {
  const [open, setOpen] = useState(false);
  const [requestType, setRequestType] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [newValue, setNewValue] = useState("");
  const [contact, setContact] = useState("");
  const [token, setToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [isSubmitting, startTransition] = useTransition();

  const siteKey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY;
  const wantsFields = TYPES_WITH_FIELDS.includes(requestType);

  function handleOpen() {
    setOpen(true);
    setRequestType("");
    setFields([]);
    setNewValue("");
    setContact("");
    setError(null);
    setFieldErrors({});
    setDone(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await suggestCommunityEdit({
        communityId,
        requestType,
        fields,
        newValue,
        contact,
        turnstileToken: token,
      });
      if (result.ok) {
        setDone(true);
        return;
      }
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      // A Turnstile token is single-use; get a fresh one for the next attempt.
      setToken("");
      setTurnstileKey((k) => k + 1);
    });
  }

  const err = (key: string) =>
    fieldErrors[key] ? <p className="mt-1 text-xs text-red-600">{fieldErrors[key]}</p> : null;

  return (
    <>
      <button onClick={handleOpen} className="text-sm text-slate-400 underline hover:text-slate-600">
        Suggest an edit
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.5rem] border border-white/80 bg-white p-6 text-left shadow-xl">
            <h2 className="font-serif text-xl text-slate-950">Suggest an edit</h2>
            <p className="mt-1 text-sm text-slate-500">{communityName}</p>

            {done ? (
              <div className="mt-4 space-y-4">
                <p className="text-slate-600">Thank you! We check every suggestion by hand before changing the listing.</p>
                <button onClick={() => setOpen(false)} className="text-sm text-slate-500 underline">
                  Close
                </button>
              </div>
            ) : !siteKey ? (
              <p className="mt-4 text-sm text-slate-500">This form isn&apos;t available right now. Please try again later.</p>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">What kind of change?</label>
                  <select
                    value={requestType}
                    onChange={(e) => setRequestType(e.target.value)}
                    required
                    className={inputClassName}
                  >
                    <option value="">Choose...</option>
                    {SUGGESTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {err("requestType")}
                </div>

                {wantsFields ? (
                  <fieldset>
                    <legend className="mb-1 text-sm font-medium text-slate-700">Which parts?</legend>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {SUGGESTION_FIELDS.map((f) => (
                        <label key={f} className="flex items-center gap-2 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            checked={fields.includes(f)}
                            onChange={(e) =>
                              setFields(e.target.checked ? [...fields, f] : fields.filter((x) => x !== f))
                            }
                          />
                          {f}
                        </label>
                      ))}
                    </div>
                    {err("fields")}
                  </fieldset>
                ) : null}

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">What should it say instead?</label>
                  <textarea
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    rows={4}
                    maxLength={4000}
                    required
                    className={inputClassName}
                    placeholder={
                      requestType === "duplicate"
                        ? "Paste the link of the other listing."
                        : "The correct details, a new link, or what's wrong."
                    }
                  />
                  {err("newValue")}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Your name or contact <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    maxLength={300}
                    className={inputClassName}
                  />
                  <p className="mt-1 text-xs text-slate-500">Only for us, in case we have a question. Never shown on the site.</p>
                </div>

                <Turnstile
                  key={turnstileKey}
                  siteKey={siteKey}
                  onSuccess={setToken}
                  onExpire={() => setToken("")}
                  onError={() => setToken("")}
                  options={{ theme: "light", size: "flexible" }}
                />

                {error ? <p className="text-sm text-red-600">{error}</p> : null}

                <div className="flex items-center justify-between gap-3">
                  <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:text-slate-700">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !token || !requestType}
                    className="rounded-full bg-(--color-ink) px-5 py-2 text-sm font-medium text-(--color-mist) disabled:opacity-50"
                  >
                    {isSubmitting ? "Sending..." : "Send suggestion"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const inputClassName =
  "w-full rounded-xl border border-(--color-sand-strong) bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-(--color-pine)";
