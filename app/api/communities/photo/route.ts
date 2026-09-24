import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import { verifyPhotoTicket } from "@/lib/community-photo-ticket";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";
import { removeImageSet, resizeAndUploadImage } from "@/lib/upload-action";

// I-111 3a: public "Add a photo" for a community, and the optional photo on the Add form.
//
// A Route Handler, not a server action, like the other upload paths (server actions cap the body at
// 1MB; the client compresses first, but a phone photo can still be a few MB). Nothing goes live
// here: the photo is resized into the community-images bucket and waits in
// community_photo_submissions until an admin approves it in /admin/communities/photos.
//
// Guards, in order: consent checkbox, then either a Turnstile token (the page dialog) or a photo
// ticket for exactly this community (the Add form, whose token was already spent), then 3 uploads
// per connection per day, then the community must exist (published, or pending with a ticket).

const RATE_LIMIT_PER_DAY = 3;

const clip = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("The upload could not be read. The photo may be too large.");
  }

  const communityId = clip(form.get("communityId"), 64);
  const file = form.get("file");
  const credit = clip(form.get("credit"), 200);
  const contact = clip(form.get("contact"), 300);
  const consent = form.get("consent") === "true";
  const ticket = clip(form.get("ticket"), 200);
  const token = clip(form.get("turnstileToken"), 4096);

  if (!/^[0-9a-f-]{36}$/i.test(communityId)) return fail("Unknown community.");
  if (!(file instanceof File) || file.size === 0) return fail("Please choose a photo.");
  if (!consent) return fail("Please confirm you may share this photo.");

  const viaTicket = Boolean(ticket) && verifyPhotoTicket(communityId, ticket);
  if (!viaTicket && !(await verifyTurnstile(token))) {
    return fail("The verification check failed. Please try again.", 403);
  }

  const rawIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const today = new Date().toISOString().slice(0, 10);
  const ipHash = createHash("sha256").update(`${rawIp}:${today}`).digest("hex");

  const supabase = createAdminClient();

  const { count } = await supabase
    .from("community_photo_submissions")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", new Date(Date.now() - 86400_000).toISOString());
  if ((count ?? 0) >= RATE_LIMIT_PER_DAY) {
    return fail("Too many photos from this connection today. Please try again tomorrow.", 429);
  }

  const { data: community } = await supabase
    .from("communities")
    .select("id, name, slug, status")
    .eq("id", communityId)
    .is("deleted_at", null)
    .maybeSingle();
  const allowed = community && (community.status === "published" || (viaTicket && community.status === "pending"));
  if (!allowed) return fail("This community can't be found.", 404);

  let imageUrl: string;
  try {
    imageUrl = await resizeAndUploadImage(file, "community-images");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The photo could not be processed.");
  }

  const { error } = await supabase.from("community_photo_submissions").insert({
    community_id: community.id,
    image_url: imageUrl,
    image_credit: credit ? (/^photo by /i.test(credit) ? credit : `Photo by ${credit}`) : null,
    contact: contact || null,
    ip_hash: ipHash,
  });
  if (error) {
    await removeImageSet(imageUrl, "community-images");
    return fail("Something went wrong saving your photo. Please try again.", 500);
  }

  // A photo that comes with a new Add-form submission is covered by that submission's ping.
  if (!viaTicket) await notifyTelegram(community.name, community.slug);

  return NextResponse.json({ ok: true });
}

async function notifyTelegram(name: string, slug: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const threadId = process.env.TELEGRAM_REPORT_THREAD_ID;
  if (!token || !chatId) return;

  // Community only: the photo itself and the uploader's contact stay in the admin view (I-159).
  const text = [
    `📷 New community photo`,
    `${name} → https://citreasurehunt.com/communities/${slug}`,
    "→ https://citreasurehunt.com/admin/communities/photos",
  ].join("\n");

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_thread_id: threadId ? Number(threadId) : undefined,
        text,
        link_preview_options: { is_disabled: true },
      }),
    });
  } catch {
    // A failed ping must not fail the upload; the queue badge still shows it.
  }
}
