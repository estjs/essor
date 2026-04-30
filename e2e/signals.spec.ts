import { expect, test } from './test-utils';

test.describe('signals example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('signals');
  });

  test('renders the derived signal summary', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Signals Example' })).toBeVisible();
    await expect(page.locator('[data-test="greeting"]')).toHaveText('Hello, Essor');
    await expect(page.locator('[data-test="signature"]')).toHaveText('ESSOR · 5 letters');
  });

  test('applies counter helpers and batch updates', async ({ page, assertNoConsoleErrors }) => {
    await page.getByRole('button', { name: 'Add 5 in batch' }).click();

    await expect(page.locator('[data-test="count"]')).toHaveText('5');
    await expect(page.locator('[data-test="double"]')).toHaveText('10');
    await expect(page.locator('[data-test="parity"]')).toHaveText('odd');

    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.locator('[data-test="count"]')).toHaveText('6');

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.locator('[data-test="count"]')).toHaveText('0');

    await assertNoConsoleErrors();
  });
});
