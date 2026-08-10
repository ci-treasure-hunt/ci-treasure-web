"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MoreVertical, Share, Smartphone, SquarePlus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// Neither platform gets a reliable native install prompt: Chrome's
// beforeinstallprompt eligibility heuristics are inconsistent, and iOS has no
// automatic prompt at all. So this is a plain instructional walkthrough on
// both platforms rather than depending on beforeinstallprompt — same choice
// ci-events.org's install banner makes (I-142 addendum).
function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function InstallToHomeScreen() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // visible and ios are always set together after mount (both read browser-only APIs that
  // don't exist during SSR) — one state object, one setState call, instead of two.
  const [{ visible, ios }, setPlatform] = useState({ visible: false, ios: true });

  useEffect(() => {
    // Can't compute this via a lazy useState initializer instead: window/navigator don't exist
    // during SSR, so the server-rendered and first-client-render values must both start at the
    // defaults above to avoid a hydration mismatch — this effect correcting them post-mount is
    // the actual fix, not a workaround for one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform({ visible: !isStandalone(), ios: isIos() });
  }, []);

  if (!visible || pathname !== "/") return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 bg-(--color-pine) px-4 py-2 text-sm font-semibold text-white sm:hidden"
      >
        <Smartphone className="size-4" />
        Add to Home Screen
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Home Screen</DialogTitle>
            <DialogDescription className="sr-only">
              Instructions for adding CI Treasure Hunt to your home screen.
            </DialogDescription>
          </DialogHeader>
          {ios ? (
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>
                <span className="inline-flex flex-wrap items-center gap-1">
                  Open this website in Safari and tap the
                  <Share className="size-4 shrink-0" />
                  Share icon in the toolbar.
                </span>
              </li>
              <li>Scroll down and tap &quot;Add to Home Screen&quot;.</li>
              <li>Tap &quot;Add&quot; to confirm.</li>
            </ol>
          ) : (
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>
                <span className="inline-flex flex-wrap items-center gap-1">
                  Open this website in Chrome and tap the
                  <MoreVertical className="size-4 shrink-0" />
                  menu icon in the toolbar.
                </span>
              </li>
              <li>
                <span className="inline-flex flex-wrap items-center gap-1">
                  Tap
                  <SquarePlus className="size-4 shrink-0" />
                  &quot;Add to Home Screen&quot; (sometimes shown as
                  &quot;Install app&quot;).
                </span>
              </li>
              <li>Tap &quot;Add&quot; / &quot;Install&quot; to confirm.</li>
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
