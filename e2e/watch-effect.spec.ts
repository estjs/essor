import { expect, test } from './test-utils';

test.describe('watch-effect example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('watch-effect');
  });

  test('watch logs newValue/oldValue history on each change', async ({ page }) => {
    await expect(page.locator('[data-test="watch-log"]')).toHaveText('');
    // immediate watcher fired once on setup with oldValue === undefined
    await expect(page.locator('[data-test="immediate-log"]')).toHaveText('undefined -> 0');

    await page.locator('[data-test="watch-increment"]').click();
    await expect(page.locator('[data-test="watch-count"]')).toHaveText('1');
    await expect(page.locator('[data-test="watch-log"]')).toHaveText('0 -> 1');

    await page.locator('[data-test="watch-increment"]').click();
    await expect(page.locator('[data-test="watch-log"]')).toHaveText('0 -> 1 | 1 -> 2');
    await expect(page.locator('[data-test="immediate-log"]')).toHaveText(
      'undefined -> 0 | 0 -> 1 | 1 -> 2',
    );
  });

  test('once watcher fires a single time and then stays silent', async ({ page }) => {
    await expect(page.locator('[data-test="once-calls"]')).toHaveText('0');

    await page.locator('[data-test="once-increment"]').click();
    await expect(page.locator('[data-test="once-source"]')).toHaveText('1');
    await expect(page.locator('[data-test="once-calls"]')).toHaveText('1');

    await page.locator('[data-test="once-increment"]').click();
    await page.locator('[data-test="once-increment"]').click();
    // source keeps moving, the callback count does not
    await expect(page.locator('[data-test="once-source"]')).toHaveText('3');
    await expect(page.locator('[data-test="once-calls"]')).toHaveText('1');
  });

  test('multi-source watch receives the values of both sources', async ({ page }) => {
    await expect(page.locator('[data-test="multi-log"]')).toHaveText('');

    await page.locator('[data-test="multi-increment-first"]').click();
    await expect(page.locator('[data-test="multi-log"]')).toHaveText('1,0');

    await page.locator('[data-test="multi-increment-second"]').click();
    await expect(page.locator('[data-test="multi-log"]')).toHaveText('1,0 | 1,1');
  });

  test('effect cleanup runs before every re-run', async ({ page }) => {
    // effect ran once eagerly on setup, no cleanup yet
    await expect(page.locator('[data-test="effect-runs"]')).toHaveText('1');
    await expect(page.locator('[data-test="cleanup-calls"]')).toHaveText('0');

    await page.locator('[data-test="effect-trigger"]').click();
    await expect(page.locator('[data-test="effect-runs"]')).toHaveText('2');
    await expect(page.locator('[data-test="cleanup-calls"]')).toHaveText('1');

    await page.locator('[data-test="effect-trigger"]').click();
    await expect(page.locator('[data-test="effect-runs"]')).toHaveText('3');
    await expect(page.locator('[data-test="cleanup-calls"]')).toHaveText('2');
  });

  test('untrack reads do not trigger the effect', async ({ page }) => {
    await expect(page.locator('[data-test="untrack-runs"]')).toHaveText('1');
    await expect(page.locator('[data-test="seen-ignored"]')).toHaveText('0');

    // Changing the untracked signal updates its displayed value but
    // does NOT re-run the effect.
    await page.locator('[data-test="ignored-increment"]').click();
    await page.locator('[data-test="ignored-increment"]').click();
    await expect(page.locator('[data-test="ignored-value"]')).toHaveText('2');
    await expect(page.locator('[data-test="untrack-runs"]')).toHaveText('1');
    await expect(page.locator('[data-test="seen-ignored"]')).toHaveText('0');

    // Changing the tracked signal re-runs the effect, which now sees the
    // latest untracked value.
    await page.locator('[data-test="tracked-increment"]').click();
    await expect(page.locator('[data-test="untrack-runs"]')).toHaveText('2');
    await expect(page.locator('[data-test="seen-ignored"]')).toHaveText('2');
  });

  test('runs without console errors', async ({ page, assertNoConsoleErrors }) => {
    await page.locator('[data-test="watch-increment"]').click();
    await page.locator('[data-test="once-increment"]').click();
    await page.locator('[data-test="multi-increment-first"]').click();
    await page.locator('[data-test="effect-trigger"]').click();
    await page.locator('[data-test="ignored-increment"]').click();
    await page.locator('[data-test="tracked-increment"]').click();

    await expect(page.locator('[data-test="untrack-runs"]')).toHaveText('2');

    await assertNoConsoleErrors();
  });
});
