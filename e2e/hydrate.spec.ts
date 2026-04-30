import { expect, test } from './test-utils';

test.describe('hydrate example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('hydrate');
  });

  test('hydrates the shell and applies preset note actions', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Hydrate Example' })).toBeVisible();
    await expect(page.locator('[data-test="hydration-status"]')).toHaveText('hydrated client');
    await expect(page.locator('[data-test="draft-preview"]')).toHaveText('No draft yet');

    await page.getByRole('button', { name: 'Load note' }).click();
    await expect(page.locator('[data-test="draft-preview"]')).toContainText(
      'Ship the client bundle',
    );
  });

  test('switches panels without losing the shell', async ({ page, assertNoConsoleErrors }) => {
    await page.getByRole('button', { name: 'Show logs' }).click();
    await expect(page.locator('[data-test="logs-view"]')).toBeVisible();

    await page.getByRole('button', { name: 'Show overview' }).click();
    await expect(page.locator('[data-test="overview-view"]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Hydrate Example' })).toBeVisible();

    await assertNoConsoleErrors();
  });
});
