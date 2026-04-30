import { expect, test } from './test-utils';

test.describe('provide example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('provide');
  });

  test('shares reactive state through provide and inject', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Provide Example' })).toBeVisible();
    await expect(page.locator('[data-test="root-theme"]')).toHaveText('ocean');
    await expect(page.locator('[data-test="nested-theme"]')).toHaveText('ocean');

    await page.getByRole('button', { name: 'Increment shared count' }).click();

    await expect(page.locator('[data-test="root-count"]')).toHaveText('1');
    await expect(page.locator('[data-test="nested-count"]')).toHaveText('1');
  });

  test('keeps nested consumers in sync across repeated updates', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    await page.getByRole('button', { name: 'Increment shared count' }).click();
    await page.getByRole('button', { name: 'Increment shared count' }).click();

    await expect(page.locator('[data-test="root-theme"]')).toHaveText('ocean');
    await expect(page.locator('[data-test="nested-theme"]')).toHaveText('ocean');

    await expect(page.locator('[data-test="root-count"]')).toHaveText('2');
    await expect(page.locator('[data-test="nested-count"]')).toHaveText('2');

    await assertNoConsoleErrors();
  });
});
