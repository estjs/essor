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
});
