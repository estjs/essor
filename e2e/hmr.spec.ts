import { expect, test } from './test-utils';

test.describe('hmr example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('hmr');
  });

  test('renders the hot refresh workbench', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'HMR Example' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Stateful Counter' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Module Inspector' })).toBeVisible();
    await expect(page.locator('[data-test="hmr-note"]')).toContainText(
      'State survives hot updates',
    );
  });

  test('keeps the counter interactive and shows module metadata', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    await expect(page.locator('[data-test="hmr-count"]')).toHaveText('0');

    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Decrement' }).click();

    await expect(page.locator('[data-test="hmr-count"]')).toHaveText('1');
    await expect(page.locator('[data-test="hmr-version"]')).toContainText('Version');
    await expect(page.locator('[data-test="hmr-version"]')).toContainText('2026.04');

    await assertNoConsoleErrors();
  });
});
