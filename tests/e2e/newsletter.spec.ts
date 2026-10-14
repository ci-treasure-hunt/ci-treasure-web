import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// I-160: our own newsletter form, the unchecked box at sign-up, and the dashboard offer.
//
// The decline path and the unchecked box always run (no EmailOctopus call). The paths that create
// real EmailOctopus contacts only run with E2E_NEWSLETTER=1 plus EMAILOCTOPUS_API_KEY/LIST_ID, and
// delete every contact they made. The form test also needs the server started with Cloudflare's
// always-pass Turnstile test keys (site 1x00000000000000000000AA, secret
// 1x0000000000000000000000000000000AA), since a headless browser cannot solve the real widget.

const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
const liveNewsletter = Boolean(
  process.env.E2E_NEWSLETTER === '1' && process.env.EMAILOCTOPUS_API_KEY && process.env.EMAILOCTOPUS_LIST_ID,
);

test.describe.configure({ timeout: 120_000 });

test.describe('I-160 newsletter', () => {
  test.skip(!hasServiceRole, 'SUPABASE_SERVICE_ROLE_KEY not set — skipping authenticated e2e coverage');

  const admin = hasServiceRole
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    : null;
  const cleanupUserIds: string[] = [];
  const cleanupEmails: string[] = [];

  test.afterAll(async () => {
    if (!admin) return;
    for (const userId of cleanupUserIds) {
      await admin.from('profiles').delete().eq('user_id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
    if (liveNewsletter) {
      for (const email of cleanupEmails) await deleteContact(email);
    }
  });

  function testEmail() {
    return `hello+pwtest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@citreasurehunt.com`;
  }

  async function signIn(page: Page, baseURL: string, metadata?: Record<string, unknown>) {
    const email = testEmail();
    const { data: created, error } = await admin!.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error || !created.user) throw error ?? new Error('createUser failed');
    cleanupUserIds.push(created.user.id);
    cleanupEmails.push(email);
    const { data: link, error: linkError } = await admin!.auth.admin.generateLink({ type: 'magiclink', email });
    if (linkError || !link.properties) throw linkError ?? new Error('generateLink returned no data');
    await page.goto(`${baseURL}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink&next=/dashboard`);
    await page.getByRole('button', { name: 'Finish signing in' }).click();
    // Path check, not a regex: the confirm page's own URL carries next=/dashboard.
    await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 60_000 });
    return { email, userId: created.user.id };
  }

  async function contactStatus(email: string): Promise<string | null> {
    const res = await fetch(
      `https://api.emailoctopus.com/lists/${process.env.EMAILOCTOPUS_LIST_ID}/contacts/${await contactId(email)}`,
      { headers: { Authorization: `Bearer ${process.env.EMAILOCTOPUS_API_KEY}` } },
    );
    return res.ok ? ((await res.json()) as { status: string }).status : null;
  }

  // EmailOctopus accepts the lowercase MD5 of the address as the contact id.
  async function contactId(email: string) {
    const { createHash } = await import('crypto');
    return createHash('md5').update(email.toLowerCase()).digest('hex');
  }

  async function deleteContact(email: string) {
    await fetch(
      `https://api.emailoctopus.com/lists/${process.env.EMAILOCTOPUS_LIST_ID}/contacts/${await contactId(email)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${process.env.EMAILOCTOPUS_API_KEY}` } },
    );
  }

  test('sign-in form has the newsletter box, unchecked', async ({ page }) => {
    await page.goto('/auth');
    const box = page.getByRole('checkbox', { name: /monthly newsletter/ });
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();
  });

  test('dashboard offer: "No thanks" hides it for good', async ({ page, baseURL }) => {
    const { userId } = await signIn(page, baseURL!);
    await expect(page.getByText('Get the monthly newsletter?')).toBeVisible();
    await page.getByRole('button', { name: 'No thanks' }).click();
    await expect(page.getByText('Get the monthly newsletter?')).toHaveCount(0, { timeout: 30_000 });
    await page.reload();
    await expect(page.getByText('Find your profile')).toBeVisible();
    await expect(page.getByText('Get the monthly newsletter?')).toHaveCount(0);
    const { data } = await admin!.auth.admin.getUserById(userId);
    expect(data.user?.user_metadata?.newsletter).toBe('declined');
  });

  test('live: dashboard Subscribe creates a pending contact', async ({ page, baseURL }) => {
    test.skip(!liveNewsletter, 'set E2E_NEWSLETTER=1 to create real EmailOctopus contacts');
    const { email } = await signIn(page, baseURL!);
    await page.getByRole('button', { name: 'Subscribe' }).click();
    await expect(page.getByText(/Almost done! We sent an email to/)).toBeVisible({ timeout: 30_000 });
    expect(await contactStatus(email)).toBe('pending');
  });

  test('live: the sign-up box subscribes on the first dashboard visit', async ({ page, baseURL }) => {
    test.skip(!liveNewsletter, 'set E2E_NEWSLETTER=1 to create real EmailOctopus contacts');
    const { email } = await signIn(page, baseURL!, { newsletter_optin: true });
    await expect(page.getByText('Thanks for subscribing to the newsletter!')).toBeVisible();
    await expect(page.getByText('Get the monthly newsletter?')).toHaveCount(0);
    expect(await contactStatus(email)).toBe('pending');
  });

  test('live: the /newsletter form subscribes', async ({ page }) => {
    test.skip(!liveNewsletter, 'set E2E_NEWSLETTER=1 to create real EmailOctopus contacts');
    const email = testEmail();
    cleanupEmails.push(email);
    await page.goto('/newsletter');
    await page.getByLabel('Email').fill(email);
    const subscribe = page.getByRole('button', { name: 'Subscribe' });
    await expect(subscribe).toBeEnabled({ timeout: 30_000 });
    await subscribe.click();
    await expect(page.getByText(/Almost done! We sent you an email/)).toBeVisible({ timeout: 30_000 });
    expect(await contactStatus(email)).toBe('pending');
  });
});
