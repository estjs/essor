import { expect, test } from './test-utils';

test.describe('store example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('store');
  });

  test('actions update state and getters derive from it', async ({ page }) => {
    await expect(page.locator('[data-test="summary-quantity"]')).toHaveText('0');
    await expect(page.locator('[data-test="summary-price"]')).toHaveText('0');
    await expect(page.locator('[data-test="summary-lines"]')).toHaveText('0');

    await page.locator('[data-test="add-apple"]').click();
    await expect(page.locator('[data-test="summary-quantity"]')).toHaveText('1');
    await expect(page.locator('[data-test="summary-price"]')).toHaveText('3');
    await expect(page.locator('[data-test="summary-lines"]')).toHaveText('1');

    // Adding the same product again bumps quantity, not the line count.
    await page.locator('[data-test="add-apple"]').click();
    await expect(page.locator('[data-test="summary-quantity"]')).toHaveText('2');
    await expect(page.locator('[data-test="summary-price"]')).toHaveText('6');
    await expect(page.locator('[data-test="summary-lines"]')).toHaveText('1');
  });

  test('getters combine multiple products correctly', async ({ page }) => {
    await page.locator('[data-test="add-apple"]').click();
    await page.locator('[data-test="add-banana"]').click();
    await page.locator('[data-test="add-banana"]').click();

    await expect(page.locator('[data-test="summary-quantity"]')).toHaveText('3');
    // 1 * $3 + 2 * $2 = $7
    await expect(page.locator('[data-test="summary-price"]')).toHaveText('7');
    await expect(page.locator('[data-test="summary-lines"]')).toHaveText('2');
  });

  test('two sibling components stay in sync through the shared store', async ({ page }) => {
    await expect(page.locator('[data-test="list-quantity"]')).toHaveText('0');

    // Action fired from ProductList is visible in CartSummary...
    await page.locator('[data-test="add-banana"]').click();
    await expect(page.locator('[data-test="list-quantity"]')).toHaveText('1');
    await expect(page.locator('[data-test="summary-quantity"]')).toHaveText('1');

    // ...and the action fired from CartSummary is visible in ProductList.
    await page.locator('[data-test="clear-cart"]').click();
    await expect(page.locator('[data-test="list-quantity"]')).toHaveText('0');
    await expect(page.locator('[data-test="summary-quantity"]')).toHaveText('0');
    await expect(page.locator('[data-test="summary-price"]')).toHaveText('0');
  });

  test('runs without console errors', async ({ page, assertNoConsoleErrors }) => {
    await page.locator('[data-test="add-apple"]').click();
    await page.locator('[data-test="add-banana"]').click();
    await page.locator('[data-test="clear-cart"]').click();

    await expect(page.locator('[data-test="summary-quantity"]')).toHaveText('0');

    await assertNoConsoleErrors();
  });
});
