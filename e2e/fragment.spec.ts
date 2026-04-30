import { expect, test } from './test-utils';

test.describe('fragment example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('fragment');
  });

  test('renders summary rows without wrapper elements', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Fragment Example' })).toBeVisible();
    await expect(page.locator('[data-test="summary-row"]')).toHaveCount(2);
    await expect(page.locator('[data-test="detail-row"]')).toHaveCount(2);
    await expect(page.locator('[data-test="detail-row"]').first()).toBeHidden();
    await expect(page.locator('[data-test="fragment-body"] > div')).toHaveCount(0);
    await expect(page.locator('[data-test="fragment-body"] > tr')).toHaveCount(4);
    await expect(page.locator('[data-test="row-count"]')).toHaveText('2 rows rendered');
  });

  test('adds detail rows by toggling fragment output', async ({ page, assertNoConsoleErrors }) => {
    await page.getByRole('button', { name: 'Show details' }).click();

    await expect(page.locator('[data-test="summary-row"]')).toHaveCount(2);
    await expect(page.locator('[data-test="detail-row"]')).toHaveCount(2);
    await expect(page.locator('[data-test="detail-row"]').first()).toBeVisible();
    await expect(page.locator('[data-test="fragment-body"] > div')).toHaveCount(0);
    await expect(page.locator('[data-test="row-count"]')).toHaveText('4 rows rendered');

    await assertNoConsoleErrors();
  });
});
