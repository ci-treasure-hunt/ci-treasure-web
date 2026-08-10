import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Authenticated e2e coverage for the I-118 claim flows. Signs in via a real magic link
// (generated through the Admin API instead of an email inbox — same verifyOtp path a real
// click hits, just without needing to read email) against throwaway accounts created per
// test run, not a fixed shared account: this suite runs across multiple Playwright projects
// (chromium, Mobile Safari) in parallel, and a shared account's profile/claim state collides
// across workers. Requires SUPABASE_SERVICE_ROLE_KEY; skips entirely if it's not set rather
// than failing CI runs that don't have it configured.

const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);

test.describe('I-118 claim flows (authenticated)', () => {
  test.skip(!hasServiceRole, 'SUPABASE_SERVICE_ROLE_KEY not set — skipping authenticated e2e coverage');

  const admin = hasServiceRole
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    : null;

  let testEventId: string;
  let testEventShortId: string;
  const cleanupUserIds: string[] = [];

  test.beforeAll(async () => {
    if (!admin) return;
    // Throwaway published event with no organizer — exercises the exact CTA state I-118
    // added, without touching any real listing.
    const { data, error } = await admin
      .from('events')
      .insert({
        short_id: `zT${Math.random().toString(36).slice(2, 8)}`,
        title: 'Playwright Test Event — safe to delete',
        type: 'workshop',
        start_date: '2027-01-01',
        end_date: '2027-01-02',
        timezone: 'Europe/Berlin',
        city: 'Testville',
        country: 'DE',
        source: 'manual',
        status: 'published',
        hide: false,
      })
      .select('id, short_id')
      .single();
    if (error) throw error;
    testEventId = data.id;
    testEventShortId = data.short_id;
  });

  test.afterAll(async () => {
    if (!admin) return;
    if (testEventId) {
      await admin.from('event_claims').delete().eq('event_id', testEventId);
      await admin.from('event_organizers').delete().eq('event_id', testEventId);
      await admin.from('event_teachers').delete().eq('event_id', testEventId);
      await admin.from('events').delete().eq('id', testEventId);
    }
    for (const userId of cleanupUserIds) {
      await admin.from('profiles').delete().eq('user_id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  // Throwaway account + owned profile, cleaned up in afterAll via cleanupUserIds. Each test
  // gets its own so parallel projects (chromium, Mobile Safari) never share mutable account
  // state — that's what caused the flakiness a shared "test" account had.
  async function createTestAccountWithProfile(opts: { isOrganizer?: boolean } = {}) {
    const email = `hello+pwtest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@citreasurehunt.com`;
    const { data: created, error: createError } = await admin!.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (createError || !created.user) throw createError ?? new Error('createUser failed');
    cleanupUserIds.push(created.user.id);

    if (opts.isOrganizer) {
      const { error: profileError } = await admin!.from('profiles').insert({
        name: 'Playwright Test Profile — safe to delete',
        slug: `playwright-test-profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        user_id: created.user.id,
        visibility: 'public',
        is_organizer: true,
      });
      if (profileError) throw profileError;
    }

    return email;
  }

  async function signInViaMagicLink(page: import('@playwright/test').Page, email: string, baseURL: string) {
    // generateLink's action_link is Supabase's own /verify redirect, which returns tokens in
    // a URL fragment (implicit flow) since there's no browser-side PKCE code_verifier cookie
    // behind an admin-generated link — fragments never reach the server, so /auth/confirm's
    // code/token_hash query-param checks would never see them. Skip straight to /auth/confirm
    // with the token_hash it already explicitly supports as a query param instead.
    const { data, error } = await admin!.auth.admin.generateLink({ type: 'magiclink', email });
    if (error || !data) throw error ?? new Error('generateLink returned no data');
    await page.goto(
      `${baseURL}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=/dashboard`,
    );
  }

  test('claiming a no-organizer event: CTA -> submit -> dashboard shows pending', async ({ page, baseURL }) => {
    // /dashboard/claim-event only renders the Organizer/Teacher form when the signed-in user
    // owns a profile, so this account needs one up front.
    const email = await createTestAccountWithProfile({ isOrganizer: true });

    await signInViaMagicLink(page, email, baseURL!);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto(`/events/${testEventShortId}`);
    await expect(page.getByText('No organizer is listed for this event yet')).toBeVisible();

    await page.getByRole('link', { name: 'Claim it' }).click();
    // /auth bounces straight through to next since we're already signed in.
    await expect(page).toHaveURL(new RegExp(`/dashboard/claim-event\\?event=${testEventId}`));

    await page.getByLabel('Organizer').check();
    await page.getByRole('button', { name: 'Submit claim' }).click();
    await expect(page.getByText('Submitted — an admin will review it')).toBeVisible();

    await page.goto('/dashboard');
    await expect(page.getByText('Event claims pending review')).toBeVisible();
    await expect(page.getByText('Playwright Test Event — safe to delete')).toBeVisible();
  });

  test('new-profile duplicate warning: similar name surfaces existing profile', async ({ page, baseURL }) => {
    const email = await createTestAccountWithProfile();

    await signInViaMagicLink(page, email, baseURL!);
    await page.goto('/dashboard/new-profile');

    // Deliberate near-miss of a real profile (Irene Sposetti) to trigger the pg_trgm warning.
    await page.getByLabel('Name *').fill('Irene Sposetty');
    await page.getByRole('button', { name: 'Create profile' }).click();

    await expect(page.getByText('a similar name')).toBeVisible();
    await expect(page.getByRole('link', { name: 'This is me' })).toBeVisible();

    // Don't actually claim someone else's real profile from a throwaway account — confirm
    // the "not me" path completes account creation instead.
    await page.getByRole('button', { name: /None of these are me/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
