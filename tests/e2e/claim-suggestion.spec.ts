import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// I-074 follow-up: "Is this you?" on the dashboard for a user without a profile. A stored profile
// email or an exact Google name suggests one profile; an ambiguous match suggests nothing. Same
// throwaway-account sign-in as claim-flows.spec.ts.

const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);

test.describe.configure({ timeout: 120_000 });

test.describe('I-074 claim suggestion (authenticated)', () => {
  test.skip(!hasServiceRole, 'SUPABASE_SERVICE_ROLE_KEY not set — skipping authenticated e2e coverage');

  const admin = hasServiceRole
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    : null;
  const cleanupUserIds: string[] = [];
  const cleanupProfileIds: string[] = [];

  test.afterAll(async () => {
    if (!admin) return;
    for (const id of cleanupProfileIds) {
      await admin.from('entity_emails').delete().eq('entity_type', 'profile').eq('entity_id', id);
      await admin.from('profiles').delete().eq('id', id);
    }
    for (const userId of cleanupUserIds) await admin.auth.admin.deleteUser(userId);
  });

  const tag = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  async function makeProfile(name: string, email?: string) {
    const { data, error } = await admin!
      .from('profiles')
      .insert({ name, slug: `playwright-suggest-${tag()}`, visibility: 'public', is_teacher: true })
      .select('id')
      .single();
    if (error || !data) throw error ?? new Error('profile insert failed');
    cleanupProfileIds.push(data.id);
    if (email) {
      const { error: emailError } = await admin!
        .from('entity_emails')
        .insert({ entity_type: 'profile', entity_id: data.id, email, source: 'manual' });
      if (emailError) throw emailError;
    }
    return data.id as string;
  }

  async function signIn(page: Page, baseURL: string | undefined, email: string, meta: Record<string, string> = {}) {
    const { data: created, error } = await admin!.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { newsletter: 'declined', ...meta },
    });
    if (error || !created.user) throw error ?? new Error('createUser failed');
    cleanupUserIds.push(created.user.id);
    const { data: link, error: linkError } = await admin!.auth.admin.generateLink({ type: 'magiclink', email });
    if (linkError || !link.properties) throw linkError ?? new Error('generateLink returned no data');
    await page.goto(`${baseURL}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink&next=/dashboard`);
    await page.getByRole('button', { name: 'Finish signing in' }).click();
    await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 60_000 });
  }

  test('stored email suggests that profile', async ({ page, baseURL }) => {
    const email = `hello+pwtest-${tag()}@citreasurehunt.com`;
    const name = `Playwright Suggest ${tag()}`;
    const id = await makeProfile(name, email);
    await signIn(page, baseURL, email);

    await expect(page.getByRole('heading', { name: 'Is this you?' })).toBeVisible();
    await expect(page.getByText('with the email address you signed in with')).toBeVisible();
    await expect(page.getByRole('link', { name })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Yes, this is me' })).toHaveAttribute(
      'href',
      `/dashboard/claim?profile=${id}`,
    );
    // The manual options stay below for the "not me" case.
    await expect(page.getByRole('heading', { name: 'Not you?' })).toBeVisible();
  });

  test('exact Google name suggests that profile', async ({ page, baseURL }) => {
    const name = `Playwright Googlename ${tag()}`;
    await makeProfile(name);
    await signIn(page, baseURL, `hello+pwtest-${tag()}@citreasurehunt.com`, { full_name: name.toLowerCase() });

    await expect(page.getByText('with the name on your Google account')).toBeVisible();
    await expect(page.getByRole('link', { name })).toBeVisible();
  });

  test('an address shared by two profiles suggests nothing', async ({ page, baseURL }) => {
    const email = `hello+pwtest-${tag()}@citreasurehunt.com`;
    await makeProfile(`Playwright Shared A ${tag()}`, email);
    await makeProfile(`Playwright Shared B ${tag()}`, email);
    await signIn(page, baseURL, email);

    await expect(page.getByRole('heading', { name: 'Find your profile' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Is this you?' })).toHaveCount(0);
  });
});
