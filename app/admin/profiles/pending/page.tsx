import { requireAdminUser } from "@/lib/admin-auth";
import { safeExternalUrl } from "@/lib/url-safety";

import { getPendingProfiles } from "./actions";
import { ProfileReviewActions } from "./review-actions";

function roleTags(profile: { isTeacher: boolean; isOrganizer: boolean; isMusician: boolean }) {
  return [
    profile.isTeacher && "Teacher",
    profile.isOrganizer && "Organizer",
    profile.isMusician && "Musician",
  ].filter(Boolean) as string[];
}

export default async function AdminPendingProfilesPage() {
  await requireAdminUser();
  const profiles = await getPendingProfiles();

  return (
    <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-slate-950">Pending profiles</h2>
          <p className="mt-1 text-sm text-slate-600">
            Self-submitted profiles awaiting review. Approving publishes the profile. Rejecting deletes it
            and lets the submitter know why.
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
          {profiles.length} pending
        </span>
      </div>

      {profiles.length === 0 ? (
        <p className="mt-6 text-base text-slate-600">No pending profiles.</p>
      ) : (
        <ul className="mt-6 divide-y divide-(--color-sand-strong)">
          {profiles.map((profile) => {
            const website = safeExternalUrl(profile.website);
            const facebook = safeExternalUrl(profile.facebook);
            const instagram = safeExternalUrl(profile.instagram);
            return (
            <li key={profile.id} className="flex flex-col gap-3 py-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="lg:pr-6">
                <p className="font-semibold text-slate-950">{profile.name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {[roleTags(profile).join(", "), [profile.city, profile.country].filter(Boolean).join(", ")]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {profile.bio ? (
                  <p className="mt-2 max-w-xl text-sm text-slate-700">{profile.bio}</p>
                ) : (
                  <p className="mt-2 text-sm italic text-slate-400">No bio submitted.</p>
                )}
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  {website ? (
                    <a href={website} target="_blank" rel="noreferrer" className="text-(--color-pine) underline">
                      Website
                    </a>
                  ) : null}
                  {facebook ? (
                    <a href={facebook} target="_blank" rel="noreferrer" className="text-(--color-pine) underline">
                      Facebook
                    </a>
                  ) : null}
                  {instagram ? (
                    <a href={instagram} target="_blank" rel="noreferrer" className="text-(--color-pine) underline">
                      Instagram
                    </a>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Submitted by: {profile.submitterEmail ?? "— unknown —"}
                </p>
              </div>
              <ProfileReviewActions profileId={profile.id} />
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
