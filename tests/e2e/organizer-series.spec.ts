import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// I-171: an organizer adds a date to their own repeating event from /dashboard/series/[id].
// Same throwaway-account pattern and magic-link sign-in as claim-flows.spec.ts. The account is not
// trusted, so the new date stays pending: nothing goes public or gets announced, and the admin
// Telegram nudge is blanked by playwright.config.ts's webServer env.

const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);

function isoInDays(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test.describe.configure({ timeout: 120_000 });

test.describe('I-171 organizer series dates (authenticated)', () => {
  test.skip(!hasServiceRole, 'SUPABASE_SERVICE_ROLE_KEY not set — skipping authenticated e2e coverage');

  const admin = hasServiceRole
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    : null;

  const cleanup: { userIds: string[]; seriesIds: string[] } = { userIds: [], seriesIds: [] };

  test.afterAll(async () => {
    if (!admin) return;
    for (const seriesId of cleanup.seriesIds) {
      await admin.from('events').delete().eq('series_id', seriesId);
      await admin.from('event_series').delete().eq('id', seriesId);
    }
    for (const userId of cleanup.userIds) {
      await admin.from('profiles').delete().eq('user_id', userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  test('add a date with a guest teacher to an existing series', async ({ page, baseURL }) => {
    const email = `hello+pwtest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@citreasurehunt.com`;
    const { data: created, error: createError } = await admin!.auth.admin.createUser({ email, email_confirm: true });
    if (createError || !created.user) throw createError ?? new Error('createUser failed');
    const userId = created.user.id;
    cleanup.userIds.push(userId);

    const { error: profileError } = await admin!.from('profiles').insert({
      name: 'Playwright Test Profile — safe to delete',
      slug: `playwright-test-profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: userId,
      visibility: 'public',
      is_organizer: true,
    });
    if (profileError) throw profileError;

    // The series and its first date, owned by the test account. 'draft' keeps it off the site.
    const { data: series, error: seriesError } = await admin!
      .from('event_series')
      .insert({ title: 'Playwright Test Jam', series_type: 'recurring', created_by: userId })
      .select('id')
      .single();
    if (seriesError) throw seriesError;
    cleanup.seriesIds.push(series.id);
    const { error: eventError } = await admin!.from('events').insert({
      title: 'Playwright Test Jam with Old Guest',
      type: 'jam',
      start_date: isoInDays(14),
      end_date: isoInDays(14),
      timezone: 'Europe/Berlin',
      city: 'Testville',
      country: 'DE',
      source: 'manual',
      status: 'draft',
      user_id: userId,
      series_id: series.id,
    });
    if (eventError) throw eventError;

    const { data: link, error: linkError } = await admin!.auth.admin.generateLink({ type: 'magiclink', email });
    if (linkError || !link) throw linkError ?? new Error('generateLink returned no data');
    await page.goto(`${baseURL}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink&next=/dashboard`);
    await page.getByRole('button', { name: 'Finish signing in' }).click();
    // Path check, not a regex: the confirm page's own URL carries next=/dashboard.
    await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 60_000 });

    await expect(page.getByText('Your repeating events')).toBeVisible();
    await page.getByRole('link', { name: 'See all dates · add more' }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/series/${series.id}`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Playwright Test Jam' })).toBeVisible();

    const newDate = isoInDays(42);
    await page.locator('input[type="date"]').first().fill(newDate);
    await page.getByLabel(/Different teachers/).check();
    await page.getByPlaceholder('Search by name…').fill('Sabrina Huth');
    await page.getByRole('button', { name: /Sabrina Huth/ }).click();
    await page.getByLabel('Title for these dates').fill('Playwright Test Jam with Sabrina Huth');
    await page.getByRole('button', { name: 'Add dates' }).click();

    await expect(page.getByText("1 date added, waiting for review.")).toBeVisible({ timeout: 30_000 });

    const { data: rows } = await admin!
      .from('events')
      .select('title, status, source, user_id, event_teachers(role, profiles(name))')
      .eq('series_id', series.id)
      .eq('start_date', newDate);
    expect(rows).toHaveLength(1);
    const row = rows![0] as unknown as {
      title: string;
      status: string;
      source: string;
      user_id: string;
      event_teachers: Array<{ role: string; profiles: { name: string } }>;
    };
    expect(row.title).toBe('Playwright Test Jam with Sabrina Huth');
    expect(row.status).toBe('pending');
    expect(row.source).toBe('self_submitted');
    expect(row.user_id).toBe(userId);
    expect(row.event_teachers.map((t) => t.profiles.name)).toEqual(['Sabrina Huth']);
  });

  // I-185 follow-up: "Also apply my changes" copies only the fields this save changed to the other
  // upcoming dates. A date's own title (its guest) and a link label nobody can edit in the form
  // must survive; a past date must not be touched.
  test('edit one date and apply the change to all upcoming dates', async ({ page, baseURL }) => {
    const email = `hello+pwtest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@citreasurehunt.com`;
    const { data: created, error: createError } = await admin!.auth.admin.createUser({ email, email_confirm: true });
    if (createError || !created.user) throw createError ?? new Error('createUser failed');
    const userId = created.user.id;
    cleanup.userIds.push(userId);

    const { error: profileError } = await admin!.from('profiles').insert({
      name: 'Playwright Test Profile — safe to delete',
      slug: `playwright-test-profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: userId,
      visibility: 'public',
      is_organizer: true,
    });
    if (profileError) throw profileError;

    const { data: series, error: seriesError } = await admin!
      .from('event_series')
      .insert({ title: 'Playwright Test Jam', series_type: 'recurring', created_by: userId, description: 'Old text.' })
      .select('id')
      .single();
    if (seriesError) throw seriesError;
    cleanup.seriesIds.push(series.id);

    // Pending, owned by the test account: editable by it, never public, never announced.
    const base = {
      type: 'jam',
      timezone: 'Europe/Berlin',
      city: 'Testville',
      country: 'DE',
      description: 'Old text.',
      discipline: ['contact_improvisation'],
      source: 'manual',
      status: 'pending',
      user_id: userId,
      series_id: series.id,
      links: { items: [{ type: 'registration', url: 'https://example.com/register', label: 'Workshop registration' }] },
    };
    const dates = { first: isoInDays(14), guest: isoInDays(21), plain: isoInDays(28), past: isoInDays(-7) };
    const { data: rows, error: eventError } = await admin!
      .from('events')
      .insert([
        { ...base, title: 'Playwright Test Jam', start_date: dates.first, end_date: dates.first },
        { ...base, title: 'Playwright Test Jam with Guest', start_date: dates.guest, end_date: dates.guest },
        { ...base, title: 'Playwright Test Jam', start_date: dates.plain, end_date: dates.plain },
        { ...base, title: 'Playwright Test Jam', start_date: dates.past, end_date: dates.past },
      ])
      .select('short_id, start_date');
    if (eventError) throw eventError;
    const first = rows!.find((r) => r.start_date === dates.first)!;

    const { data: link, error: linkError } = await admin!.auth.admin.generateLink({ type: 'magiclink', email });
    if (linkError || !link) throw linkError ?? new Error('generateLink returned no data');
    await page.goto(`${baseURL}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink&next=/dashboard`);
    await page.getByRole('button', { name: 'Finish signing in' }).click();
    await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 60_000 });

    await page.goto(`/events/${first.short_id}-playwright-test-jam/edit`);
    await page.getByLabel(/^Description/).fill('New text with the gate code.');
    await page.getByLabel(/Also apply my changes to the other 2 upcoming dates/).check();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved. Your changes are on 2 other dates too.')).toBeVisible({ timeout: 30_000 });

    const { data: after } = await admin!
      .from('events')
      .select('title, description, start_date, links')
      .eq('series_id', series.id)
      .order('start_date');
    const byDate = Object.fromEntries((after ?? []).map((r) => [r.start_date, r]));
    for (const d of [dates.first, dates.guest, dates.plain]) {
      expect(byDate[d].description).toBe('New text with the gate code.');
      expect(byDate[d].links.items[0].label).toBe('Workshop registration');
    }
    expect(byDate[dates.guest].title).toBe('Playwright Test Jam with Guest');
    expect(byDate[dates.past].description).toBe('Old text.');

    const { data: seriesAfter } = await admin!.from('event_series').select('description').eq('id', series.id).single();
    expect(seriesAfter!.description).toBe('New text with the gate code.');
  });

  test('a series the user does not organize redirects to the dashboard', async ({ page, baseURL }) => {
    const email = `hello+pwtest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@citreasurehunt.com`;
    const { data: created, error } = await admin!.auth.admin.createUser({ email, email_confirm: true });
    if (error || !created.user) throw error ?? new Error('createUser failed');
    cleanup.userIds.push(created.user.id);

    const { data: link, error: linkError } = await admin!.auth.admin.generateLink({ type: 'magiclink', email });
    if (linkError || !link.properties) throw linkError ?? new Error('generateLink returned no data');
    await page.goto(`${baseURL}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink&next=/dashboard`);
    await page.getByRole('button', { name: 'Finish signing in' }).click();
    // Path check, not a regex: the confirm page's own URL carries next=/dashboard.
    await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 60_000 });

    const { data: other } = await admin!.from('event_series').select('id').limit(1).single();
    await page.goto(`/dashboard/series/${other!.id}`);
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
