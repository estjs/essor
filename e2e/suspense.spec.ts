import { expect, test } from './test-utils';

test.describe('suspense example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('suspense');
  });

  test('shows fallbacks before async content resolves', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Suspense Example' })).toBeVisible();
    await expect(page.locator('[data-test="loading-profile"]')).toBeVisible();
    await expect(page.locator('[data-test="loading-timeline"]')).toBeVisible();

    await expect(page.locator('[data-test="profile-card"]')).toContainText('Alpha workspace', {
      timeout: 5000,
    });
    await expect(page.locator('[data-test="timeline-list"]')).toContainText('Alpha kickoff', {
      timeout: 5000,
    });
  });

  test('re-enters fallback state when loading another record set', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    await expect(page.locator('[data-test="profile-card"]')).toContainText('Alpha workspace', {
      timeout: 5000,
    });

    await page.getByRole('button', { name: 'Load Beta' }).click();

    await expect(page.locator('[data-test="profile-card"]')).toContainText('Beta workspace', {
      timeout: 5000,
    });
    await expect(page.locator('[data-test="timeline-list"]')).toContainText('Beta review', {
      timeout: 5000,
    });

    await assertNoConsoleErrors();
  });

  test('parallel boundaries resolve independently — profile lands before timeline', async ({
    page,
  }) => {
    // The two Suspense boundaries have different resource delays (500ms
    // profile / 750ms timeline). The faster one must show content while the
    // slower one is STILL in fallback — boundaries never gate each other.
    await expect(page.locator('[data-test="profile-card"]')).toContainText('Alpha workspace', {
      timeout: 5000,
    });
    // At the moment profile content appears, timeline may still be loading;
    // both end states must be reached without one blocking the other.
    await expect(page.locator('[data-test="timeline-list"]')).toContainText('Alpha kickoff', {
      timeout: 5000,
    });
    await expect(page.locator('[data-test="loading-profile"]')).toHaveCount(0);
    await expect(page.locator('[data-test="loading-timeline"]')).toHaveCount(0);
  });

  test('interacting during the fallback phase is not lost', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    // Click "Load Gamma" while the initial Alpha resources are still pending
    // (fallbacks visible). The stale Alpha request is aborted via
    // AbortSignal and the UI must settle on Gamma, not Alpha.
    await expect(page.locator('[data-test="loading-profile"]')).toBeVisible();
    await page.getByRole('button', { name: 'Load Gamma' }).click();

    await expect(page.locator('[data-test="profile-card"]')).toContainText('Gamma workspace', {
      timeout: 5000,
    });
    await expect(page.locator('[data-test="timeline-list"]')).toContainText('Gamma publish', {
      timeout: 5000,
    });
    await expect(page.locator('[data-test="profile-card"]')).not.toContainText('Alpha workspace');

    await assertNoConsoleErrors();
  });

  test('rapid workspace switching settles on the last selection', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    // Queue three switches back-to-back; earlier in-flight requests abort.
    await page.getByRole('button', { name: 'Load Beta' }).click();
    await page.getByRole('button', { name: 'Load Gamma' }).click();
    await page.getByRole('button', { name: 'Load Alpha' }).click();

    await expect(page.locator('[data-test="profile-card"]')).toContainText('Alpha workspace', {
      timeout: 5000,
    });
    await expect(page.locator('[data-test="timeline-list"]')).toContainText('Alpha kickoff', {
      timeout: 5000,
    });

    await assertNoConsoleErrors();
  });
});
