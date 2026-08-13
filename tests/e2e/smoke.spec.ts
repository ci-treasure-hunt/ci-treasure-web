import { test, expect } from '@playwright/test';

test.describe('Public Smoke Tests', () => {
  test('homepage renders', async ({ page }) => {
    await page.goto('/');

    // Check for hero text - this should always be there
    await expect(page.getByRole('heading', { name: /Contact Improvisation events/i })).toBeVisible();

    // Check for event cards OR the expected error/empty state
    // We use a locator that might match multiple things but we only care that AT LEAST one is visible.
    const eventCards = page.locator('div[id^="event-card-"]');
    const noEvents = page.getByText(/No gatherings found/);
    const envMissing = page.getByText(/Supabase environment variables are missing/);

    const anyState = eventCards.first().or(noEvents.first()).or(envMissing.first());
    // To handle multiple matches (like both noEvents and envMissing being visible),
    // we check that the count is at least 1 instead of using toBeVisible() which has strict mode.
    // The events list is client-rendered (I-130), so a plain one-shot count() here races
    // hydration on slower engines (WebKit locally can take ~3s) — expect.poll retries instead.
    await expect.poll(() => anyState.count(), { timeout: 10_000 }).toBeGreaterThan(0);
  });

  test('country filter updates the list', async ({ page }) => {
    await page.goto('/');

    const countrySelect = page.locator('select').first();
    // Only run if there are actual countries to filter by
    const options = await countrySelect.locator('option').allInnerTexts();

    if (options.length > 1) {
      const initialEventCards = page.locator('div[id^="event-card-"]');
      // Same hydration race as the "homepage renders" test above — wait for the list to
      // actually render before reading a count from it.
      await expect.poll(() => initialEventCards.count(), { timeout: 10_000 }).toBeGreaterThan(0);
      const initialCount = await initialEventCards.count();

      // On mobile the filters are collapsed — open them first
      const filtersToggle = page.getByRole('button', { name: /Filters/i });
      if (await filtersToggle.isVisible()) {
        await filtersToggle.click();
      }

      const secondOptionValue = await countrySelect.locator('option').nth(1).getAttribute('value');
      if (secondOptionValue) {
        await countrySelect.selectOption(secondOptionValue);
        await page.waitForTimeout(1000);

        const filteredCount = await page.locator('div[id^="event-card-"]').count();
        expect(filteredCount).toBeLessThanOrEqual(initialCount);
      }
    } else {
      test.skip(true, 'No countries available to test filter');
    }
  });

  test('event detail page renders', async ({ page }) => {
    const response = await page.goto('/events/JedO-london-contact-festival');

    if (response?.status() === 200) {
      await expect(page.getByRole('heading', { name: 'London Contact Festival' })).toBeVisible();
    } else {
      // If data is missing (404), at least verify it's not a 500 crash
      expect(response?.status()).toBe(404);
      test.skip(true, 'Event data missing, skipping detail validation');
    }
  });

  test('venue detail page renders', async ({ page }) => {
    const response = await page.goto('/venues/goldsmiths-university-of-london');

    if (response?.status() === 200) {
      await expect(page.getByRole('heading', { name: 'Goldsmiths, University of London' })).toBeVisible();
    } else {
      expect(response?.status()).toBe(404);
      test.skip(true, 'Venue data missing, skipping detail validation');
    }
  });

  test('teacher detail page renders', async ({ page }) => {
    const response = await page.goto('/teachers/mary-prestidge');

    if (response?.status() === 200) {
      await expect(page.getByRole('heading', { name: 'Mary Prestidge' })).toBeVisible();
    } else {
      expect(response?.status()).toBe(404);
      test.skip(true, 'Teacher data missing, skipping detail validation');
    }
  });

  test('communities page renders', async ({ page }) => {
    await page.goto('/communities');

    const heading = page.getByRole('heading', { name: /Contact Improvisation Communities Worldwide/i });
    const errorHeading = page.getByRole('heading', { name: /Unable to load communities/i });

    // toBeVisible() auto-retries until the client-side fetch resolves; a plain
    // count() check here doesn't wait and was flaking on slower CI runs.
    await expect(heading.or(errorHeading).first()).toBeVisible();

    if (await heading.isVisible()) {
      const communityCards = page.locator('h3');
      const firstCard = communityCards.first();
      // Only check for cards if the "no communities" text isn't there
      if (await firstCard.isVisible()) {
        await expect(firstCard).toBeVisible();
      }
    }
  });

  test('mobile viewport renders correctly', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile only test');

    await page.goto('/');

    // Verify no horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasHorizontalScroll).toBe(false);

    // Check if mobile view buttons are visible
    await expect(page.getByRole('button', { name: 'List' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Map' })).toBeVisible();
  });
});
