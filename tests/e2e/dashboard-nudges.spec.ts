import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// I-173 option F: the thank-you note with the support link after an event submission. Shows only
// on the event form's redirect (?submitted=review|live), never on a plain dashboard visit. Same
// throwaway-account sign-in as claim-flows.spec.ts.

const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);

test.describe.configure({ timeout: 120_000 });

test.describe('I-173 support nudge (authenticated)', () => {
  test.skip(!hasServiceRole, 'SUPABASE_SERVICE_ROLE_KEY not set — skipping authenticated e2e coverage');

  const admin = hasServiceRole
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    : null;
  const cleanupUserIds: string[] = [];

  test.afterAll(async () => {
    if (!admin) return;
    for (const userId of cleanupUserIds) {
      await admin.from('profiles').delete().eq('user_id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  test('thank-you note after submitting, and only then', async ({ page, baseURL }) => {
    const email = `hello+pwtest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@citreasurehunt.com`;
    const { data: created, error } = await admin!.auth.admin.createUser({ email, email_confirm: true });
    if (error || !created.user) throw error ?? new Error('createUser failed');
    cleanupUserIds.push(created.user.id);
    const { error: profileError } = await admin!.from('profiles').insert({
      name: 'Playwright Test Profile — safe to delete',
      slug: `playwright-test-profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: created.user.id,
      visibility: 'public',
      is_organizer: true,
    });
    if (profileError) throw profileError;

    const { data: link, error: linkError } = await admin!.auth.admin.generateLink({ type: 'magiclink', email });
    if (linkError || !link.properties) throw linkError ?? new Error('generateLink returned no data');
    await page.goto(`${baseURL}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink&next=/dashboard`);
    await page.getByRole('button', { name: 'Finish signing in' }).click();
    // Path check, not a regex: the confirm page's own URL carries next=/dashboard.
    await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 60_000 });

    await expect(page.getByText('Thank you, your event is')).toHaveCount(0);

    await page.goto('/dashboard?submitted=review');
    await expect(page.getByText('Thank you, your event is in review!')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Support CI Treasure Hunt ❤️' })).toHaveAttribute(
      'href',
      '/support?from=submit',
    );

    await page.goto('/dashboard?submitted=live');
    await expect(page.getByText('Thank you, your event is live!')).toBeVisible();
  });
});
