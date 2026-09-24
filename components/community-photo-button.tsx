"use client";

// I-111 3a: "Add a photo" (or "Suggest a better photo" once one is live) on /communities/[slug].
// The photo goes to a moderation queue, never straight onto the page. `?photo=1` on the page URL
// opens the dialog directly, so outreach messages can link organizers straight to it. Read from
// window.location in an effect rather than useSearchParams, which would force a Suspense boundary
// and cost the page its server-rendered links (I-150).

import { useEffect, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";

import { compressImageForUpload } from "@/lib/client-image-compress";
import { PHOTO_ACCEPT, PHOTO_CONSENT_TEXT } from "@/lib/community-photo-options";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/upload-limits";

export function CommunityPhotoButton({
  communityId,
  communityName,
  hasPhoto,
}: {
  communityId: string;
  communityName: string;
  hasPhoto: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [credit, setCredit] = useState("");
  const [contact, setContact] = useState("");
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const siteKey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("photo") === "1") setOpen(true);
  }, []);

  function handleOpen() {
    setOpen(true);
    setFile(null);
    setCredit("");
    setContact("");
    setConsent(false);
    setError(null);
    setDone(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const compressed = await compressImageForUpload(file);
      if (compressed.size > MAX_UPLOAD_BYTES) {
        setError(`This photo is too large (max ${MAX_UPLOAD_MB}MB). Please choose a smaller one.`);
        return;
      }
      const body = new FormData();
      body.append("communityId", communityId);
      body.append("file", compressed);
      body.append("credit", credit);
      body.append("contact", contact);
      body.append("consent", String(consent));
      body.append("turnstileToken", token);
      const res = await fetch("/api/communities/photo", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
        setDone(true);
        return;
      }
      setError(json.error ?? "Something went wrong. Please try again.");
      // A Turnstile token is single-use; get a fresh one for the next attempt.
      setToken("");
      setTurnstileKey((k) => k + 1);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={handleOpen} className="text-sm text-slate-400 underline hover:text-slate-600">
        {hasPhoto ? "Suggest a better photo" : "Add a photo"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.5rem] border border-white/80 bg-white p-6 text-left shadow-xl">
            <h2 className="font-serif text-xl text-slate-950">{hasPhoto ? "Suggest a better photo" : "Add a photo"}</h2>
            <p className="mt-1 text-sm text-slate-500">{communityName}</p>

            {done ? (
              <div className="mt-4 space-y-4">
                <p className="text-slate-600">Thank you! We look at every photo before it goes on the page.</p>
                <button onClick={() => setOpen(false)} className="text-sm text-slate-500 underline">
                  Close
                </button>
              </div>
            ) : !siteKey ? (
              <p className="mt-4 text-sm text-slate-500">This form isn&apos;t available right now. Please try again later.</p>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <p className="text-sm text-slate-600">
                  A photo of a jam, class or gathering works best. Please no portraits of a single person, and no
                  flyers.
                </p>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Photo</label>
                  <input
                    type="file"
                    accept={PHOTO_ACCEPT}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    required
                    className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-(--color-mist) file:px-4 file:py-2 file:text-sm file:font-medium"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Photographer <span className="font-normal text-slate-400">(shown as &quot;Photo by ...&quot;)</span>
                  </label>
                  <input value={credit} onChange={(e) => setCredit(e.target.value)} maxLength={200} className={inputClassName} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Your name or contact <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={300} className={inputClassName} />
                  <p className="mt-1 text-xs text-slate-500">Only for us, in case we have a question. Never shown on the site.</p>
                </div>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" required />
                  <span>{PHOTO_CONSENT_TEXT}</span>
                </label>

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
                    disabled={busy || !token || !file || !consent}
                    className="rounded-full bg-(--color-ink) px-5 py-2 text-sm font-medium text-(--color-mist) disabled:opacity-50"
                  >
                    {busy ? "Uploading..." : "Send photo"}
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
