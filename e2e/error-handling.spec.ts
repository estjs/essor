import { expect, test } from './test-utils';

test.describe('error-handling example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('error-handling');
  });

  test('flaky resource surfaces its error state and message', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    await expect(page.locator('[data-test="flaky-state"]')).toHaveText('errored');
    await expect(page.locator('[data-test="flaky-error"]')).toContainText('Upstream unavailable');
    // No data is rendered while errored.
    await expect(page.locator('[data-test="flaky-data"]')).toHaveCount(0);

    await assertNoConsoleErrors();
  });

  test('retry recovers once the upstream succeeds', async ({ page, assertNoConsoleErrors }) => {
    await expect(page.locator('[data-test="flaky-state"]')).toHaveText('errored');

    // Attempt 2 — still failing.
    await page.locator('[data-test="flaky-retry"]').click();
    await expect(page.locator('[data-test="flaky-error"]')).toContainText('attempt 2');

    // Attempt 3 — succeeds; error UI is replaced by data.
    await page.locator('[data-test="flaky-retry"]').click();
    await expect(page.locator('[data-test="flaky-state"]')).toHaveText('ready');
    await expect(page.locator('[data-test="flaky-data"]')).toContainText('Ada Lovelace');
    await expect(page.locator('[data-test="flaky-error"]')).toHaveCount(0);

    await assertNoConsoleErrors();
  });

  test('stable resource resolves normally as the control group', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    await expect(page.locator('[data-test="stable-state"]')).toHaveText('ready');
    await expect(page.locator('[data-test="stable-data"]')).toContainText('Grace Hopper');
    await expect(page.locator('[data-test="stable-error"]')).toHaveCount(0);

    await assertNoConsoleErrors();
  });
});
