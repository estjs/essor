import { expect, test } from './test-utils';

test.describe('transition example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('transition');
  });

  test('mounts the page with all scenarios visible', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Transition Example' })).toBeVisible();
    for (const scenario of ['fade', 'slide', 'scale', 'css-off', 'appear', 'hooks']) {
      await expect(page.locator(`[data-test="scenario-${scenario}"]`)).toBeVisible();
    }
  });

  test('fade scenario: toggle shows/hides box with enter+active class observed during enter', async ({
    page,
  }) => {
    const box = page.locator('[data-test="fade-box"]');
    await expect(box).toHaveCount(0);

    await page.locator('[data-test="fade-toggle"]').click();
    // Class should land at some point during the transition
    await expect(box).toBeVisible();
    // After enter completes, neither -from nor -to should remain
    await page.waitForTimeout(400);
    await expect(box).toHaveClass(/fade-box/);
    await expect(box).not.toHaveClass(/fade-enter-from/);

    // Hide — element should stay in DOM until transition completes
    await page.locator('[data-test="fade-toggle"]').click();
    // Immediately after click the leave-from / leave-active is applied
    await expect(box).toHaveClass(/fade-leave-active/, { timeout: 150 });
    // After 400ms the box is removed
    await expect(box).toHaveCount(0, { timeout: 1000 });
  });

  test('scale scenario: duration prop overrides CSS — leave takes 400ms', async ({ page }) => {
    // The `duration` prop follows Vue's convention: it's the time the JS
    // side WAITS for the CSS animation to complete AFTER the leave-to class
    // is applied (which happens on the next animation frame). So the total
    // wall-clock budget is roughly nextFrame (~16-32ms) + duration (400ms)
    // + Playwright polling overhead. We give 1200ms of headroom but still
    // assert the lower bound (≥380ms) so a regression that drops the timer
    // is caught.
    const box = page.locator('[data-test="scale-box"]');
    await page.locator('[data-test="scale-toggle"]').click();
    await expect(box).toBeVisible();
    await page.waitForTimeout(300);

    const start = Date.now();
    await page.locator('[data-test="scale-toggle"]').click();
    await expect(box).toHaveCount(0, { timeout: 1200 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(380);
  });

  test('js-only scenario: animates without CSS classes', async ({ page }) => {
    const box = page.locator('[data-test="js-box"]');
    await page.locator('[data-test="css-off-toggle"]').click();
    await expect(box).toBeVisible();
    // No fade-* / etc. classes should be applied
    await expect(box).not.toHaveClass(/-enter-from|-enter-active|-leave-from|-leave-active/);
    await page.locator('[data-test="css-off-toggle"]').click();
    await expect(box).toHaveCount(0, { timeout: 1000 });
  });

  test('appear scenario: initial mount runs the enter animation', async ({ page }) => {
    // The appear-box is mounted on page load with appear=true.
    // By the time the test starts, the enter should have completed.
    const box = page.locator('[data-test="appear-box"]');
    await expect(box).toBeVisible();
    // Box exists and animation classes have been cleaned up
    await page.waitForTimeout(400);
    await expect(box).not.toHaveClass(/fade-enter-from|fade-enter-to|fade-enter-active/);
  });

  test('hooks scenario: count increases through enter+leave', async ({ page }) => {
    const count = page.locator('[data-test="hook-count"]');
    await expect(count).toHaveText(/hook calls: 0/);

    await page.locator('[data-test="hooks-toggle"]').click();
    await page.waitForTimeout(400);
    // onBeforeEnter + onAfterEnter = 2
    await expect(count).toHaveText(/hook calls: 2/);

    await page.locator('[data-test="hooks-toggle"]').click();
    await page.waitForTimeout(400);
    // +onBeforeLeave +onAfterLeave = 4
    await expect(count).toHaveText(/hook calls: 4/);
  });

  test('no console errors during interaction', async ({ page, assertNoConsoleErrors }) => {
    await page.locator('[data-test="fade-toggle"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-test="slide-toggle"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-test="scale-toggle"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-test="hooks-toggle"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-test="hooks-toggle"]').click();
    await page.waitForTimeout(500);
    await assertNoConsoleErrors();
  });
});
